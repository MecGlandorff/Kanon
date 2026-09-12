import { section } from './parse.js';

export function check(model) {
  const findings = [];
  const add = (file, line, message, detail = {}) => findings.push({ level: 'error', file, line, message, ...detail });
  const modules = new Map(model.modules.map(module => [module.name, module]));
  const slices = new Set(model.slices.map(slice => slice.name));
  for (const problem of model.problems) add(problem.file, problem.line, problem.message, { code: 'parse' });
  for (const module of model.modules) for (const dependency of module.uses) {
    if (!modules.has(dependency.name)) add(module.file, dependency.line, `uses unknown module "${dependency.name}"`);
  }
  for (const module of model.modules) {
    const responsibility = section(module, 'Responsibility');
    if (!responsibility?.text) add(module.file, responsibility?.line ?? 1, 'empty Responsibility');
  }
  for (const flow of model.flows) for (const step of flow.steps) {
    if (step.type === 'transfer') for (const name of new Set([step.from, step.to])) {
      if (!modules.has(name)) add(flow.file, step.line, `flow uses unknown module "${name}"`);
    }
  }
  for (const slice of model.slices) for (const ref of slice.moduleRefs) {
    if (!modules.has(ref.name)) add(slice.file, ref.line, `slice includes unknown module "${ref.name}"`);
  }
  for (const slice of model.slices) for (const ref of slice.moduleRefs) {
    if (modules.get(ref.name)?.status === 'proposed') add(slice.file, ref.line, `module "${ref.name}" is proposed, not agreed`);
  }
  for (const question of model.questions) if (!question.checked) for (const name of new Set(question.blocks)) {
    if (slices.has(name)) add(question.file, question.line, `open question blocks slice "${name}": ${question.text}`, { code: 'blocking', slice: name });
  }
  for (const flow of model.flows) for (const step of flow.steps) {
    if (step.type === 'repeat' && !flow.steps.some(earlier => earlier.number === step.fromStep && earlier.number < step.number)) {
      add(flow.file, step.line, `repeat from ${step.fromStep} must refer to an earlier step`);
    }
  }
  return findings;
}

export function formatFindings(findings) {
  return [...findings.map(item => `${item.level}  ${item.file}:${item.line}  ${item.message}`), `${findings.length} errors`].join('\n');
}

export function findingsForSlice(model, slice, findings = check(model)) {
  const files = new Set([slice.file, ...model.modules.filter(module => slice.modules.includes(module.name)).map(module => module.file)]);
  const dependencies = new Set(model.modules.filter(module => slice.modules.includes(module.name)).flatMap(module => module.uses.map(ref => `design/modules/${ref.name}.md`)));
  return findings.filter(finding => {
    if (finding.code === 'blocking') return finding.slice === slice.name;
    if (files.has(finding.file)) return true;
    return finding.code === 'parse' && (['design/system.md', 'design/decisions.md', 'design/modules', 'design/slices'].includes(finding.file) || dependencies.has(finding.file));
  });
}
