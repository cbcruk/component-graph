// Render-based behavioral equivalence — the v2 oracle the static gate can't be.
// Transpile both the original and the candidate, render the enclosing component
// with sample props via react-dom/server, and compare the HTML. If it matches
// across all samples, the refactor is behavior-preserving *for those inputs* —
// which catches edits that typecheck but silently change output (e.g. passing
// `count + 1` instead of `count`), exactly what verifyExtraction v1 misses.
//
// Honest-partial: it proves equivalence only for the given prop samples, and
// only for self-contained components (no external imports, context, or effects).
//
// Usage: node evals/render-equiv.mjs <original.tsx> <candidate.tsx> <Component> '<propsSamplesJSON>'
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as jsxRuntime from 'react/jsx-runtime';

const requireShim = (id) => {
  if (id === 'react') return React;
  if (id === 'react/jsx-runtime') return jsxRuntime;
  throw new Error(`unexpected import in fixture: ${id}`);
};

function loadComponent(code, name) {
  const js = ts.transpileModule(code, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const mod = { exports: {} };
  // eslint-disable-next-line no-new-func
  const fn = new Function('exports', 'require', 'module', js);
  fn(mod.exports, requireShim, mod);
  return mod.exports[name];
}

function render(code, name, props) {
  const Comp = loadComponent(code, name);
  if (typeof Comp !== 'function') throw new Error(`component ${name} not found`);
  return renderToStaticMarkup(React.createElement(Comp, props));
}

const [, , originalPath, candidatePath, component, samplesJson] = process.argv;
const samples = JSON.parse(samplesJson);
const original = readFileSync(originalPath, 'utf8');
const candidate = readFileSync(candidatePath, 'utf8');

const results = [];
let equivalent = true;
for (const props of samples) {
  let before = null;
  let after = null;
  let error = null;
  try {
    before = render(original, component, props);
    after = render(candidate, component, props);
  } catch (e) {
    error = e.message;
  }
  const eq = error === null && before === after;
  if (!eq) equivalent = false;
  results.push({ props, equivalent: eq, before, after, error });
}
console.log(JSON.stringify({ equivalent, results }));
