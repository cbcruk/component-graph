// Arm B executor: run the cgraph extract op with the agent-chosen params, and
// write the resulting file (or report the fail-closed refusal). The agent's job
// in arm B is only to *identify* the extraction; the tool guarantees the rest.
//
// Usage: node evals/extract-tool.mjs <fixture.tsx> '<paramsJSON>' <out.tsx>
import { readFileSync, writeFileSync } from 'node:fs';
import { extractComponent } from '../packages/cgraph/dist/extract-component.js';

const [, , fixturePath, paramsJson, outPath] = process.argv;
const { component, line, name } = JSON.parse(paramsJson);
const code = readFileSync(fixturePath, 'utf8');

const r = extractComponent({
  file: fixturePath,
  code,
  component,
  targetLine: Number(line),
  newName: name,
});

if (!r.ok) {
  console.log(JSON.stringify({ ok: false, reason: r.reason }));
  process.exit(0);
}
writeFileSync(outPath, r.output);
console.log(JSON.stringify({ ok: true }));
