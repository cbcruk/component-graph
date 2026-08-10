#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractComponent, hashSource } from './extract-component.js';
import { inlineComponent } from './inline-component.js';
import { verifyExtraction } from './verify-extraction.js';
import { applyEditsToFile } from './apply-edits.js';
import type { TextEdit } from './apply-edits.js';
import type { ExtractComponentResult } from './extract-component.js';
import type { InlineComponentResult } from './inline-component.js';

/** The success branches — what the CLI actually renders. */
type ExtractSuccess = Extract<ExtractComponentResult, { ok: true }>;
type InlineSuccess = Extract<InlineComponentResult, { ok: true }>;

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

  verify <original> <candidate> [--json]
      Accept-or-reject a freehand extraction edit (model edits, tool verifies):
      fail-closed on new type errors or an unsound extraction. No --write.

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

interface ParsedArgs {
  file: string | null;
  values: Record<string, string>;
  write: boolean;
  json: boolean;
}

/**
 * The argv shape both edit ops share: one positional file, `--key value` pairs
 * drawn from `valueFlags`, plus the common `--write`/`--json`. Returns null when
 * help was requested — the caller distinguishes that from invalid args.
 */
function parseArgs(argv: string[], valueFlags: readonly string[]): ParsedArgs | null {
  const values: Record<string, string> = {};
  let file: string | null = null;
  let write = false;
  let json = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg === '--write') write = true;
    else if (arg === '--json') json = true;
    else if (arg === '-h' || arg === '--help') return null;
    else if (arg.startsWith('--') && valueFlags.includes(arg.slice(2))) {
      const value = argv[++i];
      if (value !== undefined) values[arg.slice(2)] = value;
    } else if (!arg.startsWith('-')) file = arg;
  }
  return { file, values, write, json };
}

function parseExtractArgs(argv: string[]): ExtractOptions | null {
  const p = parseArgs(argv, ['component', 'line', 'name']);
  if (!p?.file || !p.values.component || !p.values.name || p.values.line === undefined) {
    return null;
  }
  const line = Number(p.values.line);
  if (Number.isNaN(line)) return null;
  return {
    file: p.file,
    component: p.values.component,
    line,
    name: p.values.name,
    write: p.write,
    json: p.json,
  };
}

function parseInlineArgs(argv: string[]): InlineOptions | null {
  const p = parseArgs(argv, ['component', 'target']);
  if (!p?.file || !p.values.component || !p.values.target) return null;
  return {
    file: p.file,
    component: p.values.component,
    target: p.values.target,
    write: p.write,
    json: p.json,
  };
}

interface BaseOptions {
  file: string;
  write: boolean;
  json: boolean;
}

/**
 * What a checked edit op has to supply to be driven from the CLI. Everything
 * else — reading the file, the stale-hash guard, the refusal branch, the
 * dry-run/`--write` split, the atomic apply — is identical across ops and lives
 * in `runEditOp`.
 */
interface EditOpDriver<O extends BaseOptions, R extends { edits: TextEdit[] }> {
  name: string;
  parse(argv: string[]): O | null;
  run(opts: O, code: string, expectedHash: string): ({ ok: true } & R) | { ok: false; reason: string };
  /** Summary shown above the diff in a dry run. */
  preview(opts: O, result: R, rel: string): string;
  /** Confirmation line after a successful `--write`. */
  wrote(opts: O, result: R, rel: string, hash: string): string;
  /** Machine-readable payload after a successful `--write`. */
  writeJson(opts: O, result: R, rel: string, hash: string): unknown;
}

function runEditOp<O extends BaseOptions, R extends { edits: TextEdit[] }>(
  op: EditOpDriver<O, R>,
  argv: string[],
  w: Writer,
): number {
  const opts = op.parse(argv);
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

  const result = op.run(opts, code, inputHash);
  if (!result.ok) {
    if (opts.json) w.out(`${JSON.stringify(result)}\n`);
    else w.err(`cgraph: ${op.name} refused — ${result.reason}\n`);
    return 1;
  }

  const rel = relative(process.cwd(), opts.file) || opts.file;

  if (!opts.write) {
    if (opts.json) {
      w.out(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      w.out(`${op.preview(opts, result, rel)}\n\n`);
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
    w.out(`${JSON.stringify(op.writeJson(opts, result, rel, applied.hash))}\n`);
  } else {
    w.out(`${op.wrote(opts, result, rel, applied.hash)}\n`);
  }
  return 0;
}

const extractDriver: EditOpDriver<ExtractOptions, ExtractSuccess> = {
  name: 'extract',
  parse: parseExtractArgs,
  run: (opts, code, expectedHash) =>
    extractComponent({
      file: opts.file,
      code,
      component: opts.component,
      targetLine: opts.line,
      newName: opts.name,
      expectedHash,
    }),
  preview: (opts, result, rel) => {
    const propList =
      result.props.map((p) => `${p.name}: ${p.typeText}`).join(', ') || '(none)';
    return `dry-run: extract ${opts.name} from ${rel}\nprops: ${propList}`;
  },
  wrote: (opts, result, rel, hash) =>
    `wrote ${rel} — ${opts.name} (${result.props.length} prop(s)), hash ${hash}`,
  writeJson: (_opts, result, rel, hash) => ({
    ok: true,
    file: rel,
    hash,
    props: result.props,
  }),
};

const inlineDriver: EditOpDriver<InlineOptions, InlineSuccess> = {
  name: 'inline',
  parse: parseInlineArgs,
  run: (opts, code, expectedHash) =>
    inlineComponent({
      file: opts.file,
      code,
      component: opts.component,
      target: opts.target,
      expectedHash,
    }),
  preview: (opts, result, rel) => {
    const subs =
      Object.entries(result.substitutions)
        .map(([k, v]) => `${k} → ${v}`)
        .join(', ') || '(none)';
    return `dry-run: inline ${opts.target} into ${opts.component} (${rel})\nsubstitutions: ${subs}`;
  },
  wrote: (opts, _result, rel, hash) =>
    `wrote ${rel} — inlined ${opts.target}, hash ${hash}`,
  writeJson: (_opts, _result, rel, hash) => ({ ok: true, file: rel, hash }),
};

const runExtract = (argv: string[], w: Writer): number =>
  runEditOp(extractDriver, argv, w);
const runInline = (argv: string[], w: Writer): number =>
  runEditOp(inlineDriver, argv, w);

function runVerify(argv: string[], w: Writer): number {
  const files: string[] = [];
  let json = false;
  for (const arg of argv) {
    if (arg === '--json') json = true;
    else if (arg === '-h' || arg === '--help') {
      w.err(USAGE);
      return 0;
    } else if (!arg.startsWith('-')) files.push(arg);
  }
  const [originalPath, candidatePath] = files;
  if (!originalPath || !candidatePath) {
    w.err(USAGE);
    return 1;
  }

  let original: string;
  let candidate: string;
  try {
    original = readFileSync(originalPath, 'utf8');
    candidate = readFileSync(candidatePath, 'utf8');
  } catch {
    w.err(`cgraph: cannot read ${originalPath} / ${candidatePath}\n`);
    return 1;
  }

  const result = verifyExtraction({ file: candidatePath, original, candidate });
  if (json) {
    w.out(`${JSON.stringify(result)}\n`);
  } else if (result.ok) {
    w.out(`accept: sound extraction of ${result.newComponent}\n`);
  } else {
    w.err(`reject: ${result.reason}\n`);
  }
  return result.ok ? 0 : 1;
}

export function run(argv: string[], w: Writer = defaultWriter): number {
  const [subcommand, ...rest] = argv;
  if (subcommand === 'extract') return runExtract(rest, w);
  if (subcommand === 'inline') return runInline(rest, w);
  if (subcommand === 'verify') return runVerify(rest, w);
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
