#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractComponent, hashSource } from './extract-component.js';
import { inlineComponent } from './inline-component.js';
import { applyEditsToFile } from './apply-edits.js';
import type { TextEdit } from './extract-component.types.js';

interface ExtractOptions {
  file: string;
  component: string;
  line: number;
  name: string;
  write: boolean;
  json: boolean;
}

interface InlineOptions {
  file: string;
  component: string;
  target: string;
  write: boolean;
  json: boolean;
}

interface Writer {
  out(text: string): void;
  err(text: string): void;
}

const defaultWriter: Writer = {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
};

const USAGE = `cgraph <command> [options]

  extract <file> --component <Name> --line <N> --name <New> [--write] [--json]
      Extract a JSX subtree into a new sibling component (checked, fail-closed).
      --component  enclosing component whose JSX contains the target
      --line       1-based line where the subtree to extract begins
      --name       PascalCase name for the new component

  inline <file> --component <Name> --target <Name> [--write] [--json]
      Fold a single-usage component back into its call site — the inverse of
      extract (extract then inline is the identity).
      --component  enclosing component that contains the single usage
      --target     the component to inline and remove

  Common:
      --write      apply the edit to disk (atomic, stale-checked). Default: dry-run.
      --json       emit the machine-readable result instead of a diff preview.

Without --write, prints a preview diff and does not touch the file.
`;

/** Render the TextEdits as a line-anchored diff. Precise: derived from the
 *  edits themselves, not a heuristic text diff. */
function renderDiff(code: string, edits: TextEdit[]): string {
  const lines: string[] = [];
  for (const edit of [...edits].sort((a, b) => a.start - b.start)) {
    const at = code.slice(0, edit.start).split('\n').length;
    lines.push(`@@ line ${at} @@`);
    const removed = code.slice(edit.start, edit.end);
    if (removed) for (const l of removed.split('\n')) lines.push(`- ${l}`);
    if (edit.text) for (const l of edit.text.split('\n')) lines.push(`+ ${l}`);
  }
  return lines.join('\n');
}

function parseExtractArgs(argv: string[]): ExtractOptions | null {
  let file: string | null = null;
  let component: string | null = null;
  let line: number | null = null;
  let name: string | null = null;
  let write = false;
  let json = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--component') component = argv[++i] ?? null;
    else if (arg === '--line') line = Number(argv[++i]);
    else if (arg === '--name') name = argv[++i] ?? null;
    else if (arg === '--write') write = true;
    else if (arg === '--json') json = true;
    else if (arg === '-h' || arg === '--help') return null;
    else if (arg && !arg.startsWith('-')) file = arg;
  }

  if (!file || !component || !name || line === null || Number.isNaN(line)) {
    return null;
  }
  return { file, component, line, name, write, json };
}

function parseInlineArgs(argv: string[]): InlineOptions | null {
  let file: string | null = null;
  let component: string | null = null;
  let target: string | null = null;
  let write = false;
  let json = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--component') component = argv[++i] ?? null;
    else if (arg === '--target') target = argv[++i] ?? null;
    else if (arg === '--write') write = true;
    else if (arg === '--json') json = true;
    else if (arg === '-h' || arg === '--help') return null;
    else if (arg && !arg.startsWith('-')) file = arg;
  }

  if (!file || !component || !target) return null;
  return { file, component, target, write, json };
}

function runExtract(argv: string[], w: Writer): number {
  const opts = parseExtractArgs(argv);
  if (!opts) {
    w.err(USAGE);
    return argv.includes('--help') || argv.includes('-h') ? 0 : 1;
  }

  let code: string;
  try {
    code = readFileSync(opts.file, 'utf8');
  } catch {
    w.err(`cgraph: cannot read ${opts.file}\n`);
    return 1;
  }
  const inputHash = hashSource(code);

  const result = extractComponent({
    file: opts.file,
    code,
    component: opts.component,
    targetLine: opts.line,
    newName: opts.name,
    expectedHash: inputHash,
  });

  if (!result.ok) {
    if (opts.json) w.out(`${JSON.stringify(result)}\n`);
    else w.err(`cgraph: extract refused — ${result.reason}\n`);
    return 1;
  }

  const rel = relative(process.cwd(), opts.file) || opts.file;

  if (!opts.write) {
    if (opts.json) {
      w.out(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      const propList =
        result.props.map((p) => `${p.name}: ${p.typeText}`).join(', ') || '(none)';
      w.out(`dry-run: extract ${opts.name} from ${rel}\n`);
      w.out(`props: ${propList}\n\n`);
      w.out(`${renderDiff(code, result.edits)}\n\n`);
      w.out(`Re-run with --write to apply.\n`);
    }
    return 0;
  }

  const applied = applyEditsToFile({
    file: opts.file,
    edits: result.edits,
    expectedHash: inputHash,
  });
  if (!applied.ok) {
    w.err(`cgraph: write refused — ${applied.reason}\n`);
    return 1;
  }
  if (opts.json) {
    w.out(`${JSON.stringify({ ok: true, file: rel, hash: applied.hash, props: result.props })}\n`);
  } else {
    w.out(`wrote ${rel} — ${opts.name} (${result.props.length} prop(s)), hash ${applied.hash}\n`);
  }
  return 0;
}

function runInline(argv: string[], w: Writer): number {
  const opts = parseInlineArgs(argv);
  if (!opts) {
    w.err(USAGE);
    return argv.includes('--help') || argv.includes('-h') ? 0 : 1;
  }

  let code: string;
  try {
    code = readFileSync(opts.file, 'utf8');
  } catch {
    w.err(`cgraph: cannot read ${opts.file}\n`);
    return 1;
  }
  const inputHash = hashSource(code);

  const result = inlineComponent({
    file: opts.file,
    code,
    component: opts.component,
    target: opts.target,
    expectedHash: inputHash,
  });

  if (!result.ok) {
    if (opts.json) w.out(`${JSON.stringify(result)}\n`);
    else w.err(`cgraph: inline refused — ${result.reason}\n`);
    return 1;
  }

  const rel = relative(process.cwd(), opts.file) || opts.file;

  if (!opts.write) {
    if (opts.json) {
      w.out(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      const subs =
        Object.entries(result.substitutions)
          .map(([k, v]) => `${k} → ${v}`)
          .join(', ') || '(none)';
      w.out(`dry-run: inline ${opts.target} into ${opts.component} (${rel})\n`);
      w.out(`substitutions: ${subs}\n\n`);
      w.out(`${renderDiff(code, result.edits)}\n\n`);
      w.out(`Re-run with --write to apply.\n`);
    }
    return 0;
  }

  const applied = applyEditsToFile({
    file: opts.file,
    edits: result.edits,
    expectedHash: inputHash,
  });
  if (!applied.ok) {
    w.err(`cgraph: write refused — ${applied.reason}\n`);
    return 1;
  }
  if (opts.json) {
    w.out(`${JSON.stringify({ ok: true, file: rel, hash: applied.hash })}\n`);
  } else {
    w.out(`wrote ${rel} — inlined ${opts.target}, hash ${applied.hash}\n`);
  }
  return 0;
}

export function run(argv: string[], w: Writer = defaultWriter): number {
  const [subcommand, ...rest] = argv;
  if (subcommand === 'extract') return runExtract(rest, w);
  if (subcommand === 'inline') return runInline(rest, w);
  if (subcommand === '-h' || subcommand === '--help' || subcommand === undefined) {
    w.err(USAGE);
    return subcommand === undefined ? 1 : 0;
  }
  w.err(`cgraph: unknown command '${subcommand}'\n\n${USAGE}`);
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(run(process.argv.slice(2)));
}
