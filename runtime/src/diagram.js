export const nodeId = name => name.replace(/[^A-Za-z0-9_]/g, '_');
const escape = value => String(value).replaceAll('#', '#35;').replaceAll('&', '#38;').replaceAll('"', '#quot;').replaceAll('<', '#lt;').replaceAll('>', '#gt;').replaceAll('|', '#124;').replace(/[\r\n]/g, ' ');
const styles = [
  'classDef proposed fill:#fef3c7,stroke:#a16207,color:#713f12',
  'classDef agreed fill:#dbeafe,stroke:#2563eb,color:#1e3a8a',
  'classDef built fill:#dcfce7,stroke:#15803d,color:#14532d',
  'classDef missing fill:#fee2e2,stroke:#dc2626,color:#7f1d1d,stroke-dasharray:5 3',
  'classDef dim fill:#e5e7eb,stroke:#9ca3af,color:#4b5563',
];
const shapes = { agent: ['[[', ']]'], human: ['[/', '\\]'], tool: ['(', ')'], trigger: ['>', ']'],
  service: ['([', '])'], library: ['[', ']'], store: ['[(', ')]'], external: ['{{', '}}'] };

export function diagram(model, flow = null) {
  const lines = ['flowchart LR', ...styles];
  const modules = [...model.modules].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const names = new Set(modules.map(module => module.name));
  const missing = new Set(modules.flatMap(module => module.uses.map(ref => ref.name)).filter(name => !names.has(name)));
  for (const name of flow?.modules ?? []) if (!names.has(name)) missing.add(name);
  for (const module of modules) {
    const [left, right] = shapes[module.kind] ?? ['[', ']'];
    const status = flow && !flow.modules.includes(module.name) ? 'dim' : module.status;
    lines.push(`${nodeId(module.name)}${left}"${escape(module.name)}"${right}:::${status}`);
  }
  for (const name of [...missing].sort()) lines.push(`${nodeId(name)}["${escape(name)} (missing)"]:::missing`);
  if (!flow) {
    for (const module of modules) for (const ref of module.uses) {
      lines.push(`${nodeId(module.name)} -->${ref.label ? `|"${escape(ref.label)}"|` : ''} ${nodeId(ref.name)}`);
    }
  } else {
    const source = number => {
      const step = flow.steps.find(item => item.number === number);
      return step?.type === 'transfer' ? step.from : number > 1 ? source(number - 1) : null;
    };
    for (const step of flow.steps) {
      if (step.type === 'transfer') {
        lines.push(`${nodeId(step.from)} -->|"${step.number} ${step.fanOut ? `x${step.fanOut} ` : ''}${escape(step.text)}"| ${nodeId(step.to)}`);
      } else if (step.fromStep > 0 && step.fromStep < step.number) {
        const from = source(step.number - 1);
        const to = source(step.fromStep);
        if (from && to) lines.push(`${nodeId(from)} -.->|"${step.number} repeat until ${escape(step.text)}"| ${nodeId(to)}`);
      }
    }
  }
  return `${lines.join('\n')}\n`;
}
