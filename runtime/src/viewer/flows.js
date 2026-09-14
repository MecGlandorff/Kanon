import { childTrail, flowHash, flowLayout, parentTrail, processBlocks } from '../flow.js';

// Render real authored steps. This module neither infers subflows nor edits a design.
export function renderFlow(container, { model, trail, copy, navigate, selected, select = () => {}, document = globalThis.document, environment = globalThis }) {
  const flow = model.flows.find(item => item.name === trail.at(-1).flow);
  const blocks = processBlocks(flow);
  const element = (tag, className = '', text) => {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const ref = reference => {
    const button = element('button', 'flow-ref', reference);
    button.type = 'button';
    button.setAttribute('aria-label', `Copy ${reference}`);
    button.addEventListener('click', () => copy(reference));
    return button;
  };
  const open = step => {
    const button = element('button', 'flow-child', `${step.flow} ▸`);
    button.type = 'button';
    button.setAttribute('aria-label', `Open ${step.flow} inside step ${step.number}`);
    const valid = model.flows.some(item => item.name === step.flow) && !trail.some(item => item.flow === step.flow);
    button.disabled = !valid;
    if (!valid) button.title = 'This reference is missing or forms a cycle. Fix it in the design.';
    button.addEventListener('click', () => { if (valid) navigate(flowHash(childTrail(trail, step))); });
    return button;
  };
  const breadcrumbs = element('nav', 'flow-breadcrumbs');
  breadcrumbs.setAttribute('aria-label', 'Flow breadcrumb');
  trail.forEach((part, index) => {
    const last = index === trail.length - 1;
    const node = element(last ? 'span' : 'a', '', part.flow);
    if (last) node.setAttribute('aria-current', 'page');
    else node.href = flowHash(parentTrail(trail, index));
    breadcrumbs.append(node);
    if (part.step !== null) breadcrumbs.append(element('span', 'flow-crumb-step', `› ${part.step} ›`));
  });
  container.append(breadcrumbs);
  const heading = element('div', 'view-heading');
  const title = element('div');
  title.append(element('h2', '', flow.name), ref(`#${flow.name}`));
  heading.append(title);
  if (trail.length > 1) {
    const back = element('a', 'flow-back', '← Parent flow');
    back.href = flowHash(parentTrail(trail)); heading.append(back);
  }
  container.append(heading);
  const scenario = flow.sections.find(item => item.title.toLowerCase() === 'scenario')?.text;
  if (scenario) container.append(element('p', 'flow-scenario', scenario));
  const panel = element('section', 'flow-panel');
  panel.setAttribute('aria-label', 'Connected process diagram');
  panel.append(element('div', 'flow-caption', `${flow.steps.length} steps · ${blocks.length} process blocks · ▸ opens an authored inner flow`));
  const graph = element('div', 'flow-graph');
  const canvas = element('canvas', 'flow-connections'); canvas.setAttribute('aria-hidden', 'true');
  graph.append(canvas); panel.append(graph);
  panel.append(element('p', 'flow-help', 'Select a block for its steps. Follow ▸ to see inside. Click an ID to copy it.'));
  container.append(panel);
  const detail = element('section', 'flow-detail'); detail.setAttribute('aria-label', 'Selected step details');
  container.append(detail);
  const nodes = [];
  let active = true;
  let frame;
  const selectedBlock = index => {
    const block = blocks[index];
    if (!block) return;
    select(block.steps[0].number);
    nodes.forEach((node, position) => node.classList.toggle('selected', position === index));
    detail.replaceChildren();
    const introduction = element('div');
    introduction.append(element('p', 'flow-detail-label', 'Selected block'), element('h3', '', block.title));
    if (block.summary) introduction.append(element('p', 'muted', block.summary));
    detail.append(introduction);
    const list = element('ol', 'flow-detail-list');
    for (const step of block.steps) {
      const item = element('li');
      const label = element('div', 'flow-step-label');
      label.append(ref(`#${flow.name}.${step.number}`));
      if (step.type === 'transfer') {
        for (const [position, name] of [step.from, step.to].entries()) {
          if (position) label.append(element('span', '', '→'));
          const link = element('a', 'flow-module', name); link.href = `#module/${encodeURIComponent(name)}`;
          label.append(link, ref(`#${name}`));
        }
        if (step.fanOut) label.append(element('span', '', `×${step.fanOut}`));
      }
      item.append(label, element('p', 'flow-step-text', step.type === 'repeat' ? `Repeat steps ${step.fromStep}–${step.number - 1} until ${step.text}` : step.text));
      if (step.flow) item.append(open(step));
      list.append(item);
    }
    detail.append(list);
  };
  blocks.forEach((block, index) => {
    const children = block.steps.filter(step => step.flow);
    const node = element('article', 'flow-process' + (children.length ? ' has-child' : ''));
    const action = element('button', 'flow-action'); action.type = 'button';
    const numbers = block.steps.length === 1 ? String(block.steps[0].number) : `${block.steps[0].number}–${block.steps.at(-1).number}`;
    action.append(element('span', 'flow-number', `${block.steps.length === 1 ? 'STEP' : 'STEPS'} ${numbers}`), element('span', 'flow-title', block.title));
    if (block.summary) action.append(element('span', 'flow-summary', block.summary));
    action.setAttribute('aria-label', `Inspect ${block.title}`);
    action.addEventListener('click', () => selectedBlock(index));
    const references = element('div', 'flow-references');
    block.steps.forEach(step => references.append(ref(`#${flow.name}.${step.number}`)));
    node.append(action, references);
    children.forEach(step => node.append(open(step)));
    for (const step of block.steps.filter(item => item.type === 'repeat')) {
      const target = blocks.findIndex(item => item.steps.some(earlier => earlier.number === step.fromStep && earlier.number < step.number));
      const loop = element('button', 'flow-repeat', `↶ Repeat from #${flow.name}.${step.fromStep}`); loop.type = 'button';
      loop.disabled = target === -1;
      loop.addEventListener('click', () => {
        if (target === -1) return;
        selectedBlock(target); nodes[target].querySelector('button').focus({ preventScroll: true });
        nodes[target].scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });
      node.append(loop);
    }
    nodes.push(node); graph.append(node);
  });
  if (!blocks.length) graph.append(element('p', 'empty', 'No steps yet. Add numbered steps to this flow.'));
  const startingBlock = blocks.findIndex(block => block.steps.some(step => step.number === selected));
  const firstNested = blocks.findIndex(block => block.steps.some(step => step.flow));
  selectedBlock(startingBlock >= 0 ? startingBlock : Math.max(0, firstNested));
  const notes = flow.sections.filter(item => !['steps', 'scenario'].includes(item.title.toLowerCase()));
  if (notes.length) {
    const disclosures = element('details', 'flow-notes'); disclosures.append(element('summary', '', 'Notes from the design'));
    notes.forEach(note => disclosures.append(element('h3', '', note.title), element('p', '', note.text)));
    container.append(disclosures);
  }
  function layout() {
    if (!active) return;
    const { columns, cells } = flowLayout(nodes.length, graph.clientWidth);
    graph.style.gridTemplateColumns = `repeat(${columns},minmax(0,1fr))`;
    nodes.forEach((node, index) => { node.style.gridRow = String(cells[index].row + 1); node.style.gridColumn = String(cells[index].column + 1); });
    const area = graph.getBoundingClientRect();
    const scale = environment.devicePixelRatio || 1;
    canvas.width = Math.round(area.width * scale); canvas.height = Math.round(area.height * scale);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.scale(scale, scale);
    context.strokeStyle = environment.getComputedStyle(container).getPropertyValue('--flow-connector').trim() || '#91a4b2';
    context.fillStyle = context.strokeStyle; context.lineWidth = 1.5;
    nodes.slice(0, -1).forEach((node, index) => {
      const a = node.getBoundingClientRect(), b = nodes[index + 1].getBoundingClientRect();
      const horizontal = cells[index].row === cells[index + 1].row;
      const right = a.left < b.left;
      const start = horizontal ? [right ? a.right : a.left, a.top + a.height / 2] : [a.left + a.width / 2, a.bottom];
      const end = horizontal ? [right ? b.left : b.right, b.top + b.height / 2] : [b.left + b.width / 2, b.top];
      const [x, y] = [end[0] - area.left, end[1] - area.top];
      const angle = Math.atan2(end[1] - start[1], end[0] - start[0]);
      context.beginPath(); context.moveTo(start[0] - area.left, start[1] - area.top); context.lineTo(x, y); context.stroke();
      context.beginPath(); context.moveTo(x, y);
      context.lineTo(x - 5.5 * Math.cos(angle - 0.5), y - 5.5 * Math.sin(angle - 0.5));
      context.lineTo(x - 5.5 * Math.cos(angle + 0.5), y - 5.5 * Math.sin(angle + 0.5));
      context.closePath(); context.fill();
    });
  }
  const queueLayout = () => { if (active) { environment.cancelAnimationFrame(frame); frame = environment.requestAnimationFrame(layout); } };
  const observer = new environment.ResizeObserver(queueLayout); observer.observe(graph);
  queueLayout();
  return { destroy() { active = false; observer.disconnect(); environment.cancelAnimationFrame(frame); } };
}
