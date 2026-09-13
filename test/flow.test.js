import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDesign } from '../runtime/src/parse.js';
import { check } from '../runtime/src/check.js';
import { childTrail, flowHash, flowLayout, flowTrail, mainFlowNames, parentTrail, processBlocks } from '../runtime/src/flow.js';

function design(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'kanon-flow-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(new URL('fixtures/clean/design', import.meta.url), root, { recursive: true });
  unlinkSync(join(root, 'flows/process.md'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, 'flows', `${name}.md`), text);
  return parseDesign(root);
}
const rootText = '## Scenario\nA parcel moves through the workshop.\n\n## Steps\n### Receive\nKeep the original parcel identity.\n1. operator -> worker: receive parcel\n2. worker -> queue: queue parcel\n\n### Process\nInspect the parcel before delivery.\n3. worker -> worker: process parcel (flow: inspect)\n';
const nestedText = '## Steps\n1. worker -> queue: load parcel (flow: read)\n2. worker -> operator: return result\n';
const leafText = '## Steps\n1. queue -> worker: read the queued parcel\n';

test('Markdown block headings group existing steps without changing their IDs or source lines', t => {
  const model = design(t, { delivery: rootText, inspect: nestedText, read: leafText });
  assert.deepEqual(check(model), []);
  const flow = model.flows.find(item => item.name === 'delivery');
  assert.equal(flow.steps[2].flow, 'inspect');
  assert.equal(flow.steps[2].text, 'process parcel');
  assert.equal(flow.steps[2].line, 12);
  const blocks = processBlocks(flow);
  assert.deepEqual(blocks.map(block => [block.title, block.summary, block.steps.map(step => step.number)]), [
    ['Receive', 'Keep the original parcel identity.', [1, 2]],
    ['Process', 'Inspect the parcel before delivery.', [3]],
  ]);
  assert.deepEqual(mainFlowNames(model), ['delivery']);
});

test('flat flows and ungrouped leading steps keep every original step', t => {
  const model = design(t, { flat: '## Steps\n1. operator -> worker: start\n2. worker -> queue x8: enqueue\n3. repeat from 1 until done\n', mixed:'## Steps\n1. operator -> worker: start\n### Work\n2. worker -> queue: enqueue\n3. queue -> worker: finish\n' });
  assert.deepEqual(check(model), []);
  const flat = processBlocks(model.flows.find(flow => flow.name === 'flat'));
  assert.equal(flat.length, 3);
  assert.equal(flat[1].summary, 'worker → queue ×8');
  assert.equal(flat[2].title, 'Repeat steps 1–2');
  assert.deepEqual(processBlocks(model.flows.find(flow => flow.name === 'mixed')).map(block => block.steps.map(step => step.number)), [[1], [2, 3]]);
});

test('invalid references, empty groups, and missing targets report the source line', t => {
  const model = design(t, { invalid: '## Steps\n### Empty\n### Work\n1. worker -> queue: read (flow: )\n2. worker -> queue: read (flow: ../secret)\n3. worker -> queue: read (flow: absent)\n4. repeat from 1 until done (flow: absent)\n5. worker -> queue: read (flow: unclosed\n' });
  assert.deepEqual(check(model).map(finding => [finding.line, finding.message]), [
    [2, 'flow block has no steps'],
    [4, 'invalid flow reference; use a trailing (flow: name) on a transfer step'],
    [5, 'invalid flow reference; use a trailing (flow: name) on a transfer step'],
    [7, 'invalid flow reference; use a trailing (flow: name) on a transfer step'],
    [8, 'invalid flow reference; use a trailing (flow: name) on a transfer step'],
    [6, 'step references unknown flow "absent"'],
  ]);
});

test('self references and indirect cycles are errors while shared subflows are allowed', t => {
  const cyclic = design(t, { self: '## Steps\n1. worker -> queue: read (flow: self)\n', a:'## Steps\n1. worker -> queue: read (flow: b)\n', b:'## Steps\n1. worker -> queue: read (flow: a)\n' });
  assert.deepEqual(check(cyclic).map(finding => [finding.file, finding.line, finding.message]), [
    ['design/flows/b.md', 2, 'nested flow cycle through "a"'],
    ['design/flows/self.md', 2, 'a flow cannot reference itself'],
  ]);
  assert.deepEqual(mainFlowNames(cyclic), []);
  const shared = design(t, { a:'## Steps\n1. worker -> queue: read (flow: read)\n', b:'## Steps\n1. worker -> queue: read (flow: read)\n', read:leafText });
  assert.deepEqual(check(shared), []);
  assert.deepEqual(mainFlowNames(shared), ['a', 'b']);
});

test('deep acyclic nesting does not depend on the JavaScript recursion limit', t => {
  const model = design(t, {});
  model.flows = Array.from({ length: 12000 }, (_, index) => ({ name:`flow-${index}`, file:`design/flows/flow-${index}.md`, steps:[{ number:1, type:'transfer', from:'worker', to:'queue', text:'read', line:2, ...(index < 11999 ? { flow:`flow-${index + 1}` } : {}) }] }));
  assert.deepEqual(check(model), []);
  assert.deepEqual(mainFlowNames(model), ['flow-0']);
});

test('nested addresses round trip literal names and validate every parent step', t => {
  const special = 'café 100% & prototype';
  const model = design(t, { delivery:rootText.replace('inspect', special), [special]:nestedText, read:leafText });
  const trail = [{ flow:'delivery', step:3 }, { flow:special, step:1 }, { flow:'read', step:null }];
  const hash = flowHash(trail);
  assert.deepEqual(flowTrail(hash, model), trail);
  assert.equal(flowHash(parentTrail(trail)), '#flow/delivery/3/caf%C3%A9%20100%25%20%26%20prototype');
  assert.equal(flowHash(parentTrail(trail, 0)), '#flow/delivery');
  assert.deepEqual(childTrail(parentTrail(trail), { number:1, flow:'read' }), trail);
  for (const bad of ['#flow/missing', '#flow/delivery/2/read', '#flow/delivery/03/read', '#flow/delivery/3', '#flow/%xx']) assert.throws(() => flowTrail(bad, model), undefined, bad);
  const stale = structuredClone(model);
  stale.flows.find(flow => flow.name === 'delivery').steps[2].flow = 'read';
  assert.throws(() => flowTrail(hash, stale), /does not open/);
});

test('responsive layouts keep process order connected with adjacent, unique cells', () => {
  for (const width of [0, 320, 600, 1024, 1800]) for (const count of [0, 1, 2, 7, 13, 30]) {
    const layout = flowLayout(count, width);
    assert.equal(layout.cells.length, count);
    assert.equal(new Set(layout.cells.map(cell => `${cell.row},${cell.column}`)).size, count);
    for (const [index, cell] of layout.cells.entries()) {
      assert.ok(cell.column >= 0 && cell.column < layout.columns);
      if (index) {
        const previous = layout.cells[index - 1];
        assert.equal(Math.abs(previous.row - cell.row) + Math.abs(previous.column - cell.column), 1);
      }
    }
  }
});
