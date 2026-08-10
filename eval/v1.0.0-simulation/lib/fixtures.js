import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { analyzeRepo } from "../../../src/analyze.js";
import {
  CLASSIFICATION,
  SIMULATION_POPULATION_SCHEMA,
  canonicalBytes,
  canonicalJson,
  loadCanonicalJson,
  sha256,
  validateClassification,
  validateSyntheticFixture
} from "./validator.js";

export const CATEGORIES = Object.freeze([
  {
    case_prefix: "svc",
    id: "service-layout",
    structural_correspondence: "go-service"
  },
  {
    case_prefix: "wsp",
    id: "workspace-layout",
    structural_correspondence: "monorepo"
  },
  {
    case_prefix: "mdl",
    id: "model-layout",
    structural_correspondence: "python-ml"
  },
  {
    case_prefix: "web",
    id: "web-layout",
    structural_correspondence: "python-web"
  },
  {
    case_prefix: "cmd",
    id: "command-layout",
    structural_correspondence: "rust-cli"
  }
]);

export function loadSyntheticPopulation(file) {
  const loaded = loadCanonicalJson(file);
  validateSyntheticPopulation(loaded.value);
  return loaded;
}

export function validateSyntheticPopulation(population) {
  validateClassification(population);
  expect(
    population.schema === SIMULATION_POPULATION_SCHEMA &&
      population.version === 1 &&
      population.source === "deterministic-generated-fixture-seeds" &&
      isDeepStrictEqual(population.categories, CATEGORIES) &&
      Array.isArray(population.cases) &&
      population.cases.length === 20,
    "population-identity"
  );
  const seen = new Set();
  for (const seed of population.cases) {
    expect(
      seed &&
        typeof seed === "object" &&
        /^sim-(?:dev|pseudo)-[a-z]{3}-0[12]$/u.test(seed.case_id) &&
        CATEGORIES.some((category) => category.id === seed.category) &&
        [
          "synthetic-development",
          "synthetic-pseudo-holdout"
        ].includes(seed.partition) &&
        Number.isSafeInteger(seed.variant) &&
        seed.variant >= 1 &&
        seed.variant <= 4 &&
        !seen.has(seed.case_id),
      "population-case"
    );
    seen.add(seed.case_id);
  }
  for (const category of CATEGORIES) {
    const categoryCases = population.cases.filter(
      (seed) => seed.category === category.id
    );
    expect(
      categoryCases.filter(
        (seed) => seed.partition === "synthetic-development"
      ).length === 2 &&
        categoryCases.filter(
          (seed) => seed.partition === "synthetic-pseudo-holdout"
        ).length === 2,
      `population-balanced-${category.id}`
    );
  }
  return true;
}

export function expandSyntheticPopulation(population) {
  validateSyntheticPopulation(population);
  const fixtures = population.cases.map((seed) => {
    const fixture = generateSyntheticFixture(seed);
    return {
      fixture,
      fixture_sha256: sha256(canonicalBytes(fixture))
    };
  });
  expect(
    new Set(fixtures.map((fixture) => fixture.fixture_sha256)).size ===
      fixtures.length,
    "fixture-commitment-uniqueness"
  );
  return fixtures;
}

export function generateSyntheticFixture(seed) {
  const definition = fixtureDefinition(seed.category, seed.variant);
  const fixture = {
    case_id: seed.case_id,
    category: seed.category,
    files: definition.files,
    labels: definition.labels,
    partition: seed.partition,
    synthetic_identity: sha256(
      canonicalBytes({
        case_id: seed.case_id,
        category: seed.category,
        partition: seed.partition,
        variant: seed.variant
      })
    ),
    variant: seed.variant
  };
  validateSyntheticFixture(fixture);
  return fixture;
}

export function processSyntheticFixture(fixture, options = {}) {
  validateSyntheticFixture(fixture);
  const root = materializeSyntheticFixture(fixture);
  const events = [];
  const observer = (event) => {
    events.push(boundedEvent(event));
  };
  try {
    const analysis = analyzeRepo(root, {
      ...(options.trace === false ? {} : { _rankingObserver: observer }),
      inspectGit: false,
      runId: `simulation-${fixture.synthetic_identity.slice(0, 16)}`,
      scan: {
        maxElapsedMs: 10_000,
        maxEntries: 5_000,
        maxFileBytes: 256 * 1024,
        maxFiles: 1_000,
        maxTotalHashBytes: 16 * 1024 * 1024,
        maxTotalTextBytes: 4 * 1024 * 1024,
        useGitIgnore: false
      }
    });
    const predictions = extractPredictions(analysis);
    const scan = analysis.inspection?.scan || {};
    const filesScanned = Array.isArray(analysis.inspection?.files)
      ? analysis.inspection.files.length
      : 0;
    const trace = {
      candidate_event_count: events.filter(
        (event) => event.type === "candidate-discovered"
      ).length,
      complete:
        scan.complete === true &&
        filesScanned === Object.keys(fixture.files).length,
      event_count: events.length,
      event_sha256: sha256(canonicalBytes(events)),
      event_types: Array.from(
        new Set(events.map((event) => event.type))
      ).sort(),
      files_scanned: filesScanned,
      limits_reached: Array.isArray(scan.budgets_reached)
        ? [...scan.budgets_reached].sort()
        : [],
      observer_failure_count: 0,
      predictions_sha256: sha256(canonicalBytes(predictions)),
      stage_names: Array.from(
        new Set(
          events
            .map((event) => event.stage)
            .filter((stage) => typeof stage === "string")
        )
      )
    };
    return { predictions, trace };
  } finally {
    removeOwnedFixture(root);
  }
}

export function comparePredictionsToLabels(predictions, labels) {
  const predictedFiles = new Set(predictions.important_files);
  const labeledFiles = new Set(labels.important_files);
  const fileIntersection = Array.from(predictedFiles).filter((item) =>
    labeledFiles.has(item)
  );
  const runMatch = predictions.run.some(
    (candidate) =>
      candidate.cwd === labels.run.cwd &&
      candidate.command === labels.run.command
  );
  const testMatch = predictions.test.some(
    (candidate) =>
      candidate.cwd === labels.test.cwd &&
      candidate.command === labels.test.command
  );
  return {
    important_file_false_negatives:
      labeledFiles.size - fileIntersection.length,
    important_file_false_positives:
      predictedFiles.size - fileIntersection.length,
    important_file_true_positives: fileIntersection.length,
    run_exact_match: runMatch,
    test_exact_match: testMatch
  };
}

function fixtureDefinition(category, variant) {
  const marker = `synthetic variant ${variant}`;
  if (category === "service-layout") {
    const files = {
      "README.md":
        `# Synthetic service fixture\n\n${marker}. Run with go run ./cmd/service.\n`,
      "cmd/service/main.go":
        `package main\n\nfunc main() { println("${marker}") }\n`,
      "go.mod": `module simulation/service${variant}\n\ngo 1.22\n`,
      "internal/config/config.go":
        `package config\n\nconst Variant = ${variant}\n`,
      "internal/server/server.go":
        "package server\n\nfunc Start() string { return \"started\" }\n",
      "internal/transport/http.go":
        "package transport\n\nfunc Route() string { return \"/synthetic\" }\n",
      "tests/service_test.go":
        "package tests\n\nfunc SyntheticCheck() bool { return true }\n"
    };
    return definition(files, [
      "README.md",
      "go.mod",
      "cmd/service/main.go",
      "internal/server/server.go",
      "internal/config/config.go"
    ], "go run ./cmd/service", "go test ./...");
  }
  if (category === "workspace-layout") {
    const files = {
      "README.md":
        `# Synthetic workspace fixture\n\n${marker}. The console uses the core package.\n`,
      "apps/console/main.js":
        `import { value } from "../../packages/core/index.js";\nconsole.log(value, ${variant});\n`,
      "package.json": `${canonicalJson({
        private: true,
        scripts: {
          start: "node apps/console/main.js",
          test: "node --test"
        },
        workspaces: ["apps/*", "packages/*"]
      })}\n`,
      "packages/config/index.js":
        `export const variant = ${variant};\n`,
      "packages/core/index.js":
        "export const value = \"synthetic-core\";\n",
      "packages/ui/index.js":
        "export const render = () => \"synthetic-ui\";\n",
      "test/core.test.js":
        "import test from \"node:test\";\ntest(\"synthetic\", () => {});\n"
    };
    return definition(files, [
      "README.md",
      "package.json",
      "apps/console/main.js",
      "packages/core/index.js",
      "packages/config/index.js"
    ], "npm run start", "npm test");
  }
  if (category === "model-layout") {
    const files = {
      "README.md":
        `# Synthetic model fixture\n\n${marker}. The pipeline uses generated values only.\n`,
      "pyproject.toml":
        "[tool.pytest.ini_options]\npythonpath = [\".\"]\ntestpaths = [\"tests\"]\n",
      "src/data.py":
        `SYNTHETIC_ROWS = [${variant}, ${variant + 1}, ${variant + 2}]\n`,
      "src/evaluate.py":
        "def score(values):\n    return sum(values)\n",
      "src/model.py":
        "def transform(value):\n    return value * 2\n",
      "src/pipeline.py":
        "from src.data import SYNTHETIC_ROWS\n\nif __name__ == \"__main__\":\n    print(SYNTHETIC_ROWS)\n",
      "tests/test_pipeline.py":
        "def test_synthetic_pipeline():\n    assert True\n"
    };
    return definition(files, [
      "README.md",
      "pyproject.toml",
      "src/pipeline.py",
      "src/model.py",
      "src/data.py"
    ], "python -m src.pipeline", "python -m pytest");
  }
  if (category === "web-layout") {
    const files = {
      "README.md":
        `# Synthetic web fixture\n\n${marker}. Start the generated application module.\n`,
      "app/config.py": `VARIANT = ${variant}\n`,
      "app/main.py":
        "from app.routes import route\n\nif __name__ == \"__main__\":\n    print(route())\n",
      "app/routes.py":
        "def route():\n    return \"/synthetic\"\n",
      "app/service.py":
        "def response():\n    return {\"synthetic\": True}\n",
      "pyproject.toml":
        "[tool.pytest.ini_options]\npythonpath = [\".\"]\ntestpaths = [\"tests\"]\n",
      "tests/test_routes.py":
        "from app.routes import route\n\ndef test_route():\n    assert route() == \"/synthetic\"\n"
    };
    return definition(files, [
      "README.md",
      "pyproject.toml",
      "app/main.py",
      "app/routes.py",
      "app/service.py"
    ], "python -m app.main", "python -m pytest");
  }
  if (category === "command-layout") {
    const files = {
      "Cargo.toml":
        `[package]\nname = "synthetic-command-${variant}"\nversion = "0.0.${variant}"\nedition = "2021"\n`,
      "README.md":
        `# Synthetic command fixture\n\n${marker}. The command prints generated data.\n`,
      "src/args.rs":
        "pub fn parse() -> &'static str { \"synthetic\" }\n",
      "src/config.rs":
        `pub const VARIANT: usize = ${variant};\n`,
      "src/lib.rs":
        "pub mod args;\npub mod config;\npub mod output;\n",
      "src/main.rs":
        "fn main() { println!(\"synthetic\"); }\n",
      "src/output.rs":
        "pub fn render() -> &'static str { \"synthetic-output\" }\n",
      "tests/cli.rs":
        "#[test]\nfn synthetic_cli() { assert!(true); }\n"
    };
    return definition(files, [
      "README.md",
      "Cargo.toml",
      "src/main.rs",
      "src/lib.rs",
      "src/args.rs"
    ], "cargo run", "cargo test");
  }
  throw new Error("simulation: unknown-synthetic-category");
}

function definition(files, importantFiles, run, test) {
  return {
    files,
    labels: {
      important_files: importantFiles,
      run: { command: run, cwd: "." },
      status: "labelable",
      test: { command: test, cwd: "." }
    }
  };
}

function materializeSyntheticFixture(fixture) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "kanon-simulation-fixture-"))
  );
  try {
    for (const [relative, contents] of Object.entries(fixture.files)) {
      const target = path.join(root, relative);
      const parent = path.dirname(target);
      fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
      const descriptor = fs.openSync(
        target,
        fs.constants.O_CREAT |
          fs.constants.O_EXCL |
          fs.constants.O_WRONLY |
          (fs.constants.O_NOFOLLOW || 0),
        0o600
      );
      try {
        fs.writeFileSync(descriptor, contents);
      } finally {
        fs.closeSync(descriptor);
      }
    }
    return root;
  } catch (error) {
    removeOwnedFixture(root);
    throw error;
  }
}

function removeOwnedFixture(root) {
  const canonicalTemporary = fs.realpathSync(os.tmpdir());
  const canonicalRoot = fs.realpathSync(root);
  expect(
    canonicalRoot.startsWith(
      `${canonicalTemporary}${path.sep}kanon-simulation-fixture-`
    ),
    "fixture-cleanup-ownership"
  );
  fs.rmSync(canonicalRoot, { recursive: true, force: false });
}

function extractPredictions(analysis) {
  const state = analysis?.state || {};
  return {
    important_files: Array.isArray(state.important_files)
      ? state.important_files
        .map((item) => String(item?.path || ""))
        .filter(Boolean)
      : [],
    run: commandPredictions(state.commands?.run),
    test: commandPredictions(state.commands?.test)
  };
}

function commandPredictions(value) {
  return Array.isArray(value)
    ? value
      .map((item) => ({
        command: String(item?.command || ""),
        cwd: String(item?.cwd || ".")
      }))
      .filter((item) => item.command.length > 0)
    : [];
}

function boundedEvent(event) {
  const value = {
    type:
      typeof event?.type === "string"
        ? event.type.slice(0, 100)
        : "invalid-event"
  };
  if (typeof event?.path === "string") {
    value.path = event.path.slice(0, 240);
  }
  if (typeof event?.stage === "string") {
    value.stage = event.stage.slice(0, 100);
  }
  if (typeof event?.decision === "string") {
    value.decision = event.decision.slice(0, 100);
  }
  return value;
}

function expect(condition, label) {
  if (!condition) {
    throw new Error(`simulation: ${label}`);
  }
}
