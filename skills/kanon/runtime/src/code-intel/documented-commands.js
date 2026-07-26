import fs from "node:fs";
import path from "node:path";
import { DOC_PATTERN } from "./constants.js";
import { addCommand } from "./command-utils.js";
import {
  getText,
  normalizeCwd,
  normalizeRelPath,
  normalizeShellCommand,
  unique
} from "./shared.js";

export function addDocumentedCommands(
  root,
  files,
  fileMap,
  texts,
  candidates,
  options = {}
) {
  const rootReadme = files.find(
    (file) =>
      !file.path.includes("/") &&
      /^readme(?:\.[^.]+)?$/i.test(file.basename)
  );
  const rootText = rootReadme
    ? getText(root, rootReadme.path, texts, 220_000)
    : "";
  const linkedDocs = new Set(extractLinkedDocs(rootText, fileMap));
  const docs = files
    .filter((file) => file.text && DOC_PATTERN.test(file.path))
    .filter(
      (file) =>
        !file.path.includes("/") ||
        linkedDocs.has(file.path) ||
        /(^|\/)(?:docs?|doc)\/(?:development\/)?setup\.(?:md|rst)$/i.test(file.path)
    )
    .slice(0, 80);

  for (const file of docs) {
    const text = getText(root, file.path, texts, 240_000);
    const sourceScore =
      !file.path.includes("/") ? 145 :
      linkedDocs.has(file.path) ? 110 :
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
      addCommand(
        candidates[classification.group],
        item.command,
        file.path,
        sourceScore + classification.score,
        "likely",
        item.context,
        item.cwd
      );
    }
  }
}

function extractShellCommands(text, sourcePath, root) {
  const lines = text.split(/\r?\n/);
  const output = [];
  const documentDirectory = normalizeCwd(path.posix.dirname(sourcePath));
  const baseCwd = /^(?:docs?|documentation)(?:\/|$)/i.test(documentDirectory)
    ? "."
    : documentDirectory;
  let heading = "";
  let cwd = baseCwd;
  let inFence = false;
  let buffered = "";
  let cloneDirectory = null;

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (/^#{1,6}\s+/.test(trimmed)) {
      heading = trimmed.replace(/^#{1,6}\s+/, "");
    } else if (
      /^[A-Za-z][^\n]{2,80}$/.test(trimmed) &&
      /^[-=~^]{3,}\s*$/.test(lines[index + 1] || "")
    ) {
      heading = trimmed;
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
    if (!line || (!inFence && !looksLikeShellCommand(line))) {
      continue;
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
      context: `${heading} ${lines.slice(Math.max(0, index - 2), index).join(" ")}`.trim()
    });
  }
  return output;
}

function classifyCommand(command, context) {
  const lower = command.toLowerCase();
  const contextLower = context.toLowerCase();
  if (
    /^(?:git clone|cd |pip install|python -m pip|uv sync|npm install|pnpm install|yarn install|curl |wget |mkdir |export |go install)/.test(
      lower
    )
  ) {
    return null;
  }
  const headingBonus =
    /\b(?:quick ?start|getting started)\b/.test(contextLower) ? 20 :
    /\b(?:test|develop|run|train|usage)\b/.test(contextLower) ? 12 :
    0;
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
    /^python3?\s+[\w./-]*(?:train|main)\.py\b/.test(lower) ||
    /^\.[/][\w./-]+\s+(?:serve|server)\b/.test(lower)
  ) {
    return { group: "run", score: 28 + headingBonus };
  }
  if (/^(?:make|pnpm|npm|yarn|cargo) (?:run )?build\b|^make$/.test(lower)) {
    return { group: "build", score: 24 + headingBonus };
  }
  return null;
}

function looksLikeShellCommand(line) {
  return /^(?:\.\/[\w./-]+|python3?\b|py\.test\b|pytest\b|go\b|cargo\b|make\b|just\b|pnpm\b|npm\b|yarn\b|bun\b|uv\b|docker\b|bash\b|sh\b|torchrun\b|git clone\b|cd\b)/.test(
    line
  );
}

function extractLinkedDocs(readmeText, fileMap) {
  const output = [];
  for (const match of readmeText.matchAll(
    /\[[^\]]+\]\(([^)#]+)(?:#[^)]+)?\)/g
  )) {
    const target = normalizeRelPath(match[1].replace(/\/$/, "/README.md"));
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
    if (fs.existsSync(path.join(root, insideRepo))) {
      return insideRepo;
    }
  }
  const candidate = normalizeCwd(path.posix.join(current, cleaned));
  if (fs.existsSync(path.join(root, candidate))) {
    return candidate;
  }
  return current === "." ? "." : current;
}

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
