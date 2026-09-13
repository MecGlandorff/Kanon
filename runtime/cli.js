#!/usr/bin/env node
import { parseDesign } from './src/parse.js';
import { check, formatFindings } from './src/check.js';
import { diagram } from './src/diagram.js';
import { writeHandoff } from './src/handoff.js';

const usage = `Kanon — design together, hand off agreed work

kanon check
kanon diagram [--flow <name>]
kanon handoff <slice>
kanon view [overview|module/<name>|flows|decisions|questions|slices] [--port N] [--no-open]

Run from the repository containing design/. Node 20 or newer.`;

async function main(args) {
  if (!args.length || (args.length === 1 && ['--help', '-h', 'help'].includes(args[0]))) { console.log(usage); return; }
  if (args.length === 1 && args[0] === '--version') { console.log('2.0.0-dev'); return; }
  const command = args.shift();
  if (!['check', 'diagram', 'handoff', 'view'].includes(command)) throw new Error(`unknown command "${command}"\n${usage}`);
  const options = { open: true };
  const positional = [];
  while (args.length) {
    const argument = args.shift();
    if (command === 'diagram' && argument === '--flow') {
      if (options.flow !== undefined || !args.length || args[0].startsWith('--')) throw new Error('--flow requires one name');
      options.flow = args.shift();
    } else if (command === 'view' && argument === '--no-open') options.open = false;
    else if (command === 'view' && argument === '--port') {
      const value = args.shift();
      if (options.port !== undefined || !/^\d+$/.test(value ?? '') || Number(value) < 1 || Number(value) > 65535) throw new Error('--port must be an integer from 1 to 65535');
      options.port = Number(value);
    } else if (argument.startsWith('-')) throw new Error(`unknown option "${argument}"`);
    else positional.push(argument);
  }
  if (command === 'handoff' ? positional.length !== 1 : command === 'view' ? positional.length > 1 : positional.length) throw new Error(`invalid arguments\n${usage}`);
  const model = parseDesign();
  if (command === 'check') {
    const findings = check(model);
    console.log(findings.length ? formatFindings(findings) : `ok: ${model.modules.length} modules, ${model.flows.length} flows, ${model.slices.length} slices`);
    process.exitCode = findings.length ? 1 : 0;
  } else if (command === 'diagram') {
    const flow = options.flow === undefined ? null : model.flows.find(item => item.name === options.flow);
    if (options.flow !== undefined && !flow) throw new Error(`unknown flow "${options.flow}"`);
    process.stdout.write(diagram(model, flow));
  } else if (command === 'handoff') {
    const result = writeHandoff(model, positional[0]);
    if (result.findings.length) { console.log(formatFindings(result.findings)); process.exitCode = 1; }
    else console.log(result.path);
  } else {
    const { startViewer } = await import('./src/viewer/server.js');
    await startViewer(model.designDir, { ...options, view: positional[0] ?? 'overview' });
  }
}

main(process.argv.slice(2)).catch(error => { console.error(`kanon: ${error.message}`); process.exitCode = 1; });
