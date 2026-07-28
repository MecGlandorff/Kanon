import path from "node:path";
import { selectRootReadme } from "../readme.js";
import { resolveContainedPath } from "../path-security.js";
import { DOC_PATTERN } from "./constants.js";
import { addCommand } from "./command-utils.js";
import {
  getText,
  normalizeCwd,
  normalizeRelPath,
  normalizeShellCommand,
  unique
} from "./shared.js";

const MAX_DOCUMENTED_COMMAND_CHARS = 2_000;

/**
 * @typedef {import("./command-utils.js").CommandCandidate} CommandCandidate
 * @typedef {import("./shared.js").TextCache} TextCache
 * @typedef {import("../scanner/read.js").ScannedFile} ScannedFile
 * @typedef {Map<string, ScannedFile>} FileMap
 * @typedef {{
 *   run: CommandCandidate[],
 *   test: CommandCandidate[],
 *   build: CommandCandidate[],
 *   dev: CommandCandidate[]
 * }} CommandCandidates
 * @typedef {{
 *   command: string,
 *   cwd: string,
 *   context: string,
 *   order: number
 * }} ExtractedCommand
 * @typedef {{
 *   group: "run" | "test" | "build" | "dev",
 *   score: number
 * }} CommandClassification
 * @typedef {{
 *   paths: Set<string>,
 *   byBasename: Map<string, string[]>,
 *   byDirectory: Map<string, string[]>
 * }} ExecutableIndex
 */

/**
 * @param {string} root
 * @param {ScannedFile[]} files
 * @param {FileMap} fileMap
 * @param {TextCache} texts
 * @param {CommandCandidates} candidates
 * @param {{
 *   primaryGoProject?: boolean,
 *   signals?: Map<string, import("./shared.js").CodeSignal[]>
 * }} [options]
 * @returns {void}
 */
export function addDocumentedCommands(
  root,
  files,
  fileMap,
  texts,
  candidates,
  options = {}
) {
  const rootReadme = selectRootReadme(files);
  const rootText = rootReadme
    ? getText(root, rootReadme.path, texts, 220_000)
    : "";
  const linkedDocList = extractLinkedDocs(rootText, fileMap);
  const rootPathReferences = extractRootPathReferences(rootText);
  const executableIndex = indexKnownExecutables(
    options.signals || new Map()
  );
  const linkedDocs = new Set(linkedDocList);
  const linkedDocOrder = new Map(
    linkedDocList.map((filePath, index) => [filePath, index])
  );
  const docs = files
    .filter((file) => file.text && DOC_PATTERN.test(file.path))
    .filter(
      (file) =>
        !file.path.includes("/") ||
        linkedDocs.has(file.path) ||
        /(^|\/)(?:docs?|doc)\/(?:development\/)?setup\.(?:md|rst)$/i.test(file.path)
    )
    .sort((left, right) =>
      documentPriority(left.path, rootReadme?.path, linkedDocOrder) -
        documentPriority(right.path, rootReadme?.path, linkedDocOrder) ||
      left.path.localeCompare(right.path)
    )
    .slice(0, 80);

  for (const file of docs) {
    const text = getText(root, file.path, texts, 240_000);
    const linkedOrder = linkedDocOrder.get(file.path);
    const sourceScore =
      !file.path.includes("/") ? 145 :
      linkedOrder !== undefined ? 130 - Math.min(20, linkedOrder) :
      /setup\./i.test(file.basename) ? 125 :
      95;
    for (const item of extractShellCommands(text, file.path, root)) {
      const classification = classifyCommand(item.command, item.context);
      if (!classification) {
        continue;
      }
      if (
        options.primaryGoProject &&
        /^(?:npm|pnpm|yarn|bun)\b/.test(item.command)
      ) {
        continue;
      }
      const validated = validateLocalCommandTarget(
        item,
        fileMap,
        executableIndex,
        rootPathReferences
      );
      if (!validated) {
        continue;
      }
      addCommand(
        candidates[classification.group],
        validated.command,
        file.path,
        sourceScore + classification.score +
          1 / (item.order + 2),
        "likely",
        item.context,
        validated.cwd
      );
    }
  }
  addRootReferencedExecutable(
    rootText,
    fileMap,
    executableIndex,
    candidates
  );
}

/**
 * @param {string} text
 * @param {string} sourcePath
 * @param {string} root
 * @returns {ExtractedCommand[]}
 */
function extractShellCommands(text, sourcePath, root) {
  const lines = text.split(/\r?\n/);
  /** @type {ExtractedCommand[]} */
  const output = [];
  const documentDirectory = normalizeCwd(path.posix.dirname(sourcePath));
  const baseCwd = /^(?:docs?|documentation)(?:\/|$)/i.test(documentDirectory)
    ? "."
    : documentDirectory;
  /** @type {string[]} */
  const headings = [];
  let cwd = baseCwd;
  let inFence = false;
  let buffered = "";
  let cloneDirectory = null;
  let commandOrder = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = (lines[index] ?? "").trim();
    const prompted = /^\$\s+/.test(trimmed);
    const markdownHeading = !inFence
      ? trimmed.match(/^(#{1,6})\s+(.+)$/)
      : null;
    if (markdownHeading) {
      const level = markdownHeading[1]?.length || 1;
      headings.length = level - 1;
      headings[level - 1] = markdownHeading[2] || "";
    } else if (
      !inFence &&
      /^[A-Za-z][^\n]{2,80}$/.test(trimmed) &&
      /^[-=~^]{3,}\s*$/.test(lines[index + 1] || "")
    ) {
      headings.length = 0;
      headings.push(trimmed);
    }
    if (/^(?:```|~~~)/.test(trimmed)) {
      inFence = !inFence;
      continue;
    }

    let line = trimmed.replace(/^\$\s+/, "");
    if (buffered) {
      line = `${buffered} ${line}`;
      buffered = "";
    }
    if (line.endsWith("\\")) {
      buffered = line.slice(0, -1).trim();
      continue;
    }
    if (line.length > MAX_DOCUMENTED_COMMAND_CHARS) {
      continue;
    }
    if (!line) {
      continue;
    }
    if (!inFence && !prompted && !looksLikeStandaloneCommand(line)) {
      const inline = inlineDeclaredCommand(line);
      if (!inline) {
        continue;
      }
      line = inline;
    }
    if (/^git clone\s+\S+/.test(line)) {
      cloneDirectory = clonedDirectory(line);
      continue;
    }
    if (/^cd\s+\S+/.test(line)) {
      cwd = resolveDocumentCwd(
        cwd,
        line.replace(/^cd\s+/, "").trim(),
        root,
        cloneDirectory
      );
      continue;
    }
    if (!looksLikeShellCommand(line)) {
      continue;
    }
    output.push({
      command: normalizeShellCommand(line),
      cwd,
      context: `${headings.filter(Boolean).join(" ")} ${
        lines.slice(Math.max(0, index - 2), index).join(" ")
      }`.trim(),
      order: commandOrder++
    });
  }
  return output;
}

/**
 * @param {string} filePath
 * @param {string | undefined} rootReadmePath
 * @param {Map<string, number>} linkedOrder
 * @returns {number}
 */
function documentPriority(filePath, rootReadmePath, linkedOrder) {
  if (filePath === rootReadmePath) {
    return -2;
  }
  const order = linkedOrder.get(filePath);
  return order === undefined ? 10_000 : order;
}

/**
 * @param {string} command
 * @param {string} context
 * @returns {CommandClassification | null}
 */
function classifyCommand(command, context) {
  const lower = command.toLowerCase();
  const contextLower = context.toLowerCase();
  const phaseContext = contextLower.replace(
    /\b(?:quick ?start|getting started)\b/g,
    ""
  );
  if (
    /^(?:git clone|cd |pip install|python -m pip|uv sync|npm install|pnpm install|yarn install|curl |wget |mkdir |export |go install)/.test(
      lower
    )
  ) {
    return null;
  }
  const headingBonus =
    /\b(?:quick ?start|getting started|recommended)\b/.test(contextLower) ? 20 :
    /\b(?:test|develop|run|train|usage|installation)\b/.test(contextLower) ? 12 :
    0;
  const phaseAdjustment =
    /\b(?:prepare|preprocess|sample|evaluate|benchmark)\b/.test(lower) ||
    (
      /\b(?:download|prepar(?:e|ation)|preprocess|setup)\b/.test(
        phaseContext
      ) &&
      !/\b(?:run|serve|train)\b/.test(phaseContext)
    )
      ? -18
      : /\btrain\b/.test(lower) && /\btrain\b/.test(phaseContext)
        ? 12
        : 0;
  if (
    /^(?:python3?\s+-m\s+(?:pytest|unittest)\b|py\.test\b|pytest\b|go test\b|cargo test\b|make test\b|just test\b|(?:pnpm|npm|yarn|bun) (?:run )?test(?::[\w-]+)?\b)/.test(
      lower
    )
  ) {
    return { group: "test", score: 32 + headingBonus };
  }
  if (
    /\b(?:runserver|cargo run|go run)\b/.test(lower) ||
    (
      /\b(?:docker run|docker compose up)\b/.test(lower) &&
      /\b(?:quick ?start|getting started|usage|start|server)\b/.test(contextLower)
    ) ||
    /^(?:pnpm|npm|yarn|bun) (?:run )?(?:dev|start|serve|watch)\b/.test(lower) ||
    (
      /^python3?\s+[\w./-]+\.py\b/.test(lower) &&
      /\b(?:quick ?start|getting started|usage|run|start|train|example)\b/.test(
        contextLower
      )
    ) ||
    /^\.[/][\w./-]+\s+(?:serve|server)\b/.test(lower)
  ) {
    return {
      group: "run",
      score: 28 + headingBonus + phaseAdjustment
    };
  }
  if (/^(?:make|pnpm|npm|yarn|cargo) (?:run )?build\b|^make$/.test(lower)) {
    return { group: "build", score: 24 + headingBonus };
  }
  return null;
}

/**
 * @param {string} line
 * @returns {boolean}
 */
function looksLikeShellCommand(line) {
  return /^(?:\.\/[\w./-]+|python3?\b|py\.test\b|pytest\b|go\b|cargo\b|make\b|just\b|pnpm\b|npm\b|yarn\b|bun\b|uv\b|docker\b|bash\b|sh\b|torchrun\b|git clone\b|cd\b)/.test(
    line
  );
}

/**
 * @param {string} line
 * @returns {boolean}
 */
function looksLikeStandaloneCommand(line) {
  if (!looksLikeShellCommand(line) || /[.!?]$/.test(line)) {
    return false;
  }
  return !/\b(?:after|before|changes?|please|pull request|should|then)\b/i.test(
    line
  );
}

/**
 * @param {string} line
 * @returns {string | null}
 */
function inlineDeclaredCommand(line) {
  if (!/\b(?:execute|launch|run|start)\b/i.test(line)) {
    return null;
  }
  for (const match of line.matchAll(/`([^`\n]{1,500})`/g)) {
    const candidate = match[1]?.trim();
    if (candidate && looksLikeShellCommand(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * @param {string} readmeText
 * @param {FileMap} fileMap
 * @returns {string[]}
 */
function extractLinkedDocs(readmeText, fileMap) {
  /** @type {string[]} */
  const output = [];
  for (const match of readmeText.matchAll(
    /\[[^\]]+\]\(([^)#]+)(?:#[^)]+)?\)/g
  )) {
    const linked = match[1];
    if (!linked) {
      continue;
    }
    const target = normalizeRelPath(linked.replace(/\/$/, "/README.md"));
    const candidates = [
      target,
      `${target}.md`,
      `${target}/README.md`,
      `${target}/readme.md`,
      `${target}/README.rst`
    ];
    const found = candidates.find((candidate) => fileMap.has(candidate));
    if (found) {
      output.push(found);
    }
  }
  return unique(output);
}

/**
 * Reject a file-targeted command when its target is missing. When repository
 * documentation names a unique contained executable at another cwd, preserve
 * that cwd instead of inventing a root-relative command.
 *
 * @param {ExtractedCommand} item
 * @param {FileMap} fileMap
 * @param {ExecutableIndex} executableIndex
 * @param {string[]} rootReferences
 * @returns {{command: string, cwd: string} | null}
 */
function validateLocalCommandTarget(
  item,
  fileMap,
  executableIndex,
  rootReferences
) {
  const target = localCommandTarget(item.command);
  if (!target) {
    return { command: item.command, cwd: item.cwd };
  }
  const local = normalizeRelPath(
    path.posix.join(item.cwd, target.replace(/^\.\//, ""))
  );
  if (fileMap.has(local)) {
    return { command: item.command, cwd: item.cwd };
  }
  const basename = path.posix.basename(target);
  const matches = executableIndex.byBasename.get(basename) || [];
  const referencedMatches = matches.filter((filePath) =>
    rootReferences.includes(filePath)
  );
  const selected =
    referencedMatches.length === 1
      ? referencedMatches[0]
      : matches.length === 1
        ? matches[0]
        : null;
  if (!selected) {
    return null;
  }
  return {
    command: item.command,
    cwd: normalizeCwd(path.posix.dirname(selected))
  };
}

/**
 * @param {string} command
 * @returns {string | null}
 */
function localCommandTarget(command) {
  return command.match(/^python3?\s+([^\s]+\.py)\b/)?.[1] ||
    command.match(/^go\s+run\s+([^\s]+\.go)\b/)?.[1] ||
    command.match(/^\.\/([^\s]+)\b/)?.[1] ||
    null;
}

/**
 * A root document may identify a component directly while leaving its exact
 * executable command in that component. Require all three repository facts:
 * the contained reference, known executable syntax, and an interpreter
 * spelling already present in the root document.
 *
 * @param {string} rootText
 * @param {FileMap} fileMap
 * @param {ExecutableIndex} executableIndex
 * @param {CommandCandidates} candidates
 * @returns {void}
 */
function addRootReferencedExecutable(
  rootText,
  fileMap,
  executableIndex,
  candidates
) {
  const interpreter = rootText.match(/\b(python3?)\s+(?:-m|-c)\b/)?.[1];
  if (!interpreter) {
    return;
  }
  for (const reference of extractRootPathReferences(rootText)) {
    const target = referencedExecutable(
      reference,
      fileMap,
      executableIndex
    );
    if (!target) {
      continue;
    }
    addCommand(
      candidates.run,
      `${interpreter} ${target}`,
      "root documentation plus executable syntax",
      190,
      "known",
      `Root documentation directly references ${reference}.`
    );
    return;
  }
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function extractRootPathReferences(text) {
  const values = [
    ...Array.from(
      text.matchAll(/\[[^\]]*\]\(([^)#\n]+)(?:#[^)]+)?\)/g),
      (match) => match[1]
    ),
    ...Array.from(
      text.matchAll(/`([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+)`/g),
      (match) => match[1]
    )
  ];
  return unique(
    values
      .filter((value) => typeof value === "string")
      .map((value) => normalizeRelPath(value))
      .filter(
        (value) =>
          value &&
          !value.startsWith("/") &&
          !value.startsWith("../") &&
          !/^[A-Za-z]+:/.test(value)
      )
  );
}

/**
 * @param {string} reference
 * @param {FileMap} fileMap
 * @param {ExecutableIndex} executableIndex
 * @returns {string | null}
 */
function referencedExecutable(reference, fileMap, executableIndex) {
  const exact =
    fileMap.has(reference) && executableIndex.paths.has(reference)
      ? [reference]
      : [];
  const nested = executableIndex.byDirectory.get(reference) || [];
  const matches = [...exact, ...nested].filter(
    (filePath) => filePath.endsWith(".py")
  );
  return matches.length === 1 ? matches[0] || null : null;
}

/**
 * @param {Map<string, import("./shared.js").CodeSignal[]>} signals
 * @returns {ExecutableIndex}
 */
function indexKnownExecutables(signals) {
  /** @type {ExecutableIndex} */
  const index = {
    paths: new Set(),
    byBasename: new Map(),
    byDirectory: new Map()
  };
  for (const [filePath, items] of signals) {
    if (!items.some(
      (signal) =>
        signal.type === "entrypoint" &&
        signal.confidence === "known"
    )) {
      continue;
    }
    index.paths.add(filePath);
    appendIndex(
      index.byBasename,
      path.posix.basename(filePath),
      filePath
    );
    appendIndex(
      index.byDirectory,
      path.posix.dirname(filePath),
      filePath
    );
  }
  return index;
}

/**
 * @param {Map<string, string[]>} index
 * @param {string} key
 * @param {string} value
 * @returns {void}
 */
function appendIndex(index, key, value) {
  const values = index.get(key) || [];
  values.push(value);
  index.set(key, values);
}

/**
 * @param {string} current
 * @param {string} requested
 * @param {string} root
 * @param {string | null} cloneDirectory
 * @returns {string}
 */
function resolveDocumentCwd(current, requested, root, cloneDirectory) {
  const cleaned = requested.replace(/^["']|["']$/g, "").replace(/\/$/, "");
  if (!cleaned || cleaned === ".") {
    return current;
  }
  if (cleaned.startsWith("/") || cleaned.startsWith("~")) {
    return current;
  }
  if (cloneDirectory && cleaned === cloneDirectory) {
    return ".";
  }
  if (cloneDirectory && cleaned.startsWith(`${cloneDirectory}/`)) {
    const insideRepo = normalizeCwd(cleaned.slice(cloneDirectory.length + 1));
    if (containedDirectoryExists(root, insideRepo)) {
      return insideRepo;
    }
  }
  const candidate = normalizeCwd(path.posix.join(current, cleaned));
  if (containedDirectoryExists(root, candidate)) {
    return candidate;
  }
  return current === "." ? "." : current;
}

/**
 * @param {string} root
 * @param {string} relativePath
 * @returns {boolean}
 */
function containedDirectoryExists(root, relativePath) {
  return resolveContainedPath(root, relativePath, {
    type: "directory"
  }).ok;
}

/**
 * @param {string} command
 * @returns {string | null}
 */
function clonedDirectory(command) {
  const parts = command.split(/\s+/);
  const explicit = parts[3] && !parts[3].startsWith("-") ? parts[3] : null;
  const source = (explicit || parts[2] || "").replace(/^["']|["']$/g, "");
  return source
    .replace(/\/$/, "")
    .split("/")
    .pop()
    ?.replace(/\.git$/, "") || null;
}
