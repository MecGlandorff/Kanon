// Shared, data-only helpers for the viewer and its published navigation contract.
export function mainFlowNames(model) {
  const referenced = new Set(model.flows.flatMap(flow => flow.steps.flatMap(step => step.flow ? [step.flow] : [])));
  return model.flows.filter(flow => !referenced.has(flow.name)).map(flow => flow.name);
}

export function processBlocks(flow) {
  const blocks = [];
  const assigned = new Set();
  const groups = flow.blocks ?? [];
  for (const step of flow.steps) {
    if (assigned.has(step.number)) continue;
    const group = groups.find(item => item.steps.includes(step.number));
    const steps = group ? flow.steps.filter(item => group.steps.includes(item.number)) : [step];
    steps.forEach(item => assigned.add(item.number));
    blocks.push({
      title: group?.title ?? (step.type === 'repeat' ? `Repeat steps ${step.fromStep}–${step.number - 1}` : step.text),
      summary: group?.summary ?? (step.type === 'transfer' ? `${step.from} → ${step.to}${step.fanOut ? ` ×${step.fanOut}` : ''}` : `Until ${step.text}`),
      steps,
    });
  }
  return blocks;
}

export function flowHash(trail) {
  return '#flow/' + trail.flatMap(item => item.step == null ? [item.flow] : [item.flow, String(item.step)]).map(encodeURIComponent).join('/');
}

export function flowTrail(hash, model) {
  const source = hash.replace(/^#/, '');
  if (!source.startsWith('flow/')) throw new Error('Expected a flow address.');
  let parts;
  try { parts = source.slice(5).split('/').map(decodeURIComponent); }
  catch { throw new Error('Invalid encoding in the flow address.'); }
  if (parts.length % 2 !== 1) throw new Error('Incomplete flow address.');
  const flows = new Map(model.flows.map(flow => [flow.name, flow]));
  const seen = new Set();
  const trail = [];
  for (let index = 0; index < parts.length; index += 2) {
    const flow = flows.get(parts[index]);
    if (!flow) throw new Error(`Unknown flow "${parts[index]}".`);
    if (seen.has(flow.name)) throw new Error('A flow cannot contain itself.');
    seen.add(flow.name);
    const step = parts[index + 1] === undefined ? null : Number(parts[index + 1]);
    if (step !== null && (!/^[1-9]\d*$/.test(parts[index + 1]) || !Number.isSafeInteger(step) ||
        !flow.steps.some(item => item.number === step && item.flow === parts[index + 2]))) {
      throw new Error(`Step ${parts[index + 1]} does not open "${parts[index + 2]}".`);
    }
    trail.push({ flow: flow.name, step });
  }
  return trail;
}

export function parentTrail(trail, index = trail.length - 2) {
  if (index < 0 || index >= trail.length) return [];
  return trail.slice(0, index + 1).map((item, position) => ({ flow: item.flow, step: position === index ? null : item.step }));
}

export function childTrail(trail, step) {
  return [...trail.slice(0, -1), { flow: trail.at(-1).flow, step: step.number }, { flow: step.flow, step: null }];
}

export function flowLayout(count, width) {
  const fit = Math.max(1, Math.floor((width + 28) / 177));
  let columns = Math.min(Math.max(1, count), fit);
  if (columns < count && columns > 3) columns = Math.ceil(count / 2);
  columns = Math.min(columns, fit);
  return { columns, cells: Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / columns), offset = index % columns;
    return { row, column: row % 2 ? columns - offset - 1 : offset };
  }) };
}
