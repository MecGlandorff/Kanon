import { findByPath, readText } from "../scanner.js";
import { firstHeadingOrLine } from "./utils.js";

export function readPackageJson(root, files, evidence) {
  const file = findByPath(files, "package.json");
  if (!file) {
    return null;
  }
  const text = readText(root, file.path);
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return {
      path: file.path,
      json: null,
      scripts: {},
      evidence: evidence.add(
        "config",
        file.path,
        "package.json exists but could not be parsed."
      )
    };
  }
  const scripts =
    json.scripts && typeof json.scripts === "object" ? json.scripts : {};
  return {
    path: file.path,
    json,
    scripts,
    evidence: evidence.add(
      "config",
      file.path,
      `package.json declares package ${json.name || "(unnamed)"} with ${Object.keys(scripts).length} script(s).`,
      JSON.stringify({ name: json.name, scripts })
    )
  };
}

export function readPyproject(root, files, evidence) {
  const file = findByPath(files, "pyproject.toml");
  if (!file) {
    return null;
  }
  const text = readText(root, file.path);
  const hasPytest = /\[tool\.pytest\b/.test(text);
  return {
    path: file.path,
    name: findTomlString(text, "name"),
    description: findTomlString(text, "description"),
    scripts: parseTomlSection(text, "project.scripts"),
    hasPytest,
    evidence: evidence.add(
      "config",
      file.path,
      `pyproject.toml declares Python project metadata${hasPytest ? " and pytest configuration" : ""}.`,
      text.slice(0, 500)
    )
  };
}

export function readPythonHints(root, files, evidence) {
  const hints = {
    requirements: null,
    pytestConfig: null,
    mentionsPytest: false
  };
  for (const candidate of [
    "requirements.txt",
    "pytest.ini",
    "setup.cfg",
    "tox.ini"
  ]) {
    const file = findByPath(files, candidate);
    if (!file) {
      continue;
    }
    const text = readText(root, file.path, { limit: 40_000 });
    const id = evidence.add(
      "config",
      file.path,
      `${candidate} found.`,
      text.slice(0, 300)
    );
    if (candidate === "requirements.txt") {
      hints.requirements = { path: file.path, evidence: id };
      hints.mentionsPytest =
        /(^|\n)\s*pytest(?:[<>=~!;\s]|$)/i.test(text);
    } else if (/pytest/i.test(text)) {
      hints.pytestConfig = { path: file.path, evidence: id };
    }
  }
  return hints;
}

export function readSkillInfo(root, files, evidence) {
  const file = findByPath(files, "SKILL.md");
  if (!file) {
    return null;
  }
  const text = readText(root, file.path, { limit: 40_000 });
  const description =
    text.match(/^description:\s*["']?(.+?)["']?\s*$/m)?.[1] || null;
  return {
    path: file.path,
    description,
    evidence: evidence.add(
      "config",
      file.path,
      "SKILL.md found and used as declared-intent evidence.",
      description || ""
    )
  };
}

export function detectPurpose(input, evidence) {
  const {
    readmeFile,
    readmeText,
    readmeEvidence,
    packageInfo,
    pyprojectInfo,
    skillInfo
  } = input;
  if (packageInfo?.json?.description) {
    return {
      claim: packageInfo.json.description,
      confidence: "likely",
      evidence: [packageInfo.evidence]
    };
  }
  if (pyprojectInfo?.description) {
    return {
      claim: pyprojectInfo.description,
      confidence: "likely",
      evidence: [pyprojectInfo.evidence]
    };
  }
  if (readmeFile && readmeText) {
    const excerpt = firstHeadingOrLine(readmeText);
    const id =
      readmeEvidence ||
      evidence.add(
        "file",
        readmeFile.path,
        "README used to infer declared repo purpose.",
        excerpt
      );
    return {
      claim: excerpt || `Declared in ${readmeFile.path}`,
      confidence: "likely",
      evidence: [id]
    };
  }
  if (skillInfo?.description) {
    return {
      claim: skillInfo.description,
      confidence: "likely",
      evidence: [skillInfo.evidence]
    };
  }
  return {
    claim: "No README or package metadata found to describe the repo purpose.",
    confidence: "unknown",
    evidence: []
  };
}

function parseTomlSection(text, section) {
  const header = `[${section}]`;
  const entries = {};
  let active = false;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^\[.+\]$/.test(trimmed)) {
      active = trimmed === header;
      continue;
    }
    if (!active) {
      continue;
    }
    const item = line.match(
      /^\s*([A-Za-z0-9_.-]+)\s*=\s*["']([^"']+)["']/
    );
    if (item) {
      entries[item[1]] = item[2];
    }
  }
  return entries;
}

function findTomlString(text, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.match(
    new RegExp(`^\\s*${escaped}\\s*=\\s*["']([^"']+)["']`, "m")
  )?.[1] || null;
}
