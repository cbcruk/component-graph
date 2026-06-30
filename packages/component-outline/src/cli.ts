#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { extract } from './extract.js';
import { printOutline } from './print-outline.js';
import type { Outline } from './outline.types.js';

const SOURCE_EXT = new Set(['.tsx', '.jsx', '.ts', '.js']);

interface CliOptions {
  path: string;
  json: boolean;
  match: string | null;
  items: string | null;
}

function parseArgs(argv: string[]): CliOptions | null {
  let path: string | null = null;
  let json = false;
  let match: string | null = null;
  let items: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') json = true;
    else if (arg === '--match') match = argv[++i] ?? null;
    else if (arg === '--items') items = argv[++i] ?? null;
    else if (arg === '-h' || arg === '--help') return null;
    else if (arg && !arg.startsWith('-')) path = arg;
  }

  if (!path) return null;
  return { path, json, match, items };
}

function collectFiles(path: string): string[] {
  if (statSync(path).isFile()) return [path];
  const entries = readdirSync(path, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && SOURCE_EXT.has(extname(e.name)))
    .map((e) => join(e.parentPath, e.name))
    .sort();
}

function applyFilters(outline: Outline, options: CliOptions): Outline {
  let result = outline;
  if (options.match) {
    result = {
      ...result,
      components: result.components.filter((c) => c.name === options.match),
    };
  }
  if (options.items) {
    const empty: Partial<Outline> = {};
    if (options.items === 'imports') empty.components = [];
    if (options.items === 'components') empty.imports = [];
    if (options.items === 'exports') {
      empty.imports = [];
      empty.components = [];
    }
    result = { ...result, ...empty };
  }
  return result;
}

function run(argv: string[]): number {
  const options = parseArgs(argv);
  if (!options) {
    process.stderr.write(USAGE);
    return options === null && argv.includes('--help') ? 0 : 1;
  }

  const files = collectFiles(options.path);
  const outlines = files.map((file) => {
    const code = readFileSync(file, 'utf8');
    const relativePath = relative(process.cwd(), file) || file;
    return applyFilters(extract(relativePath, code), options);
  });

  if (options.json) {
    const payload = outlines.length === 1 ? outlines[0] : outlines;
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    process.stdout.write(`${outlines.map(printOutline).join('\n\n')}\n`);
  }
  return 0;
}

const USAGE = `component-outline <path> [--json] [--match <Name>] [--items imports|components|exports]

  <path>     A .tsx/.jsx/.ts/.js file, or a directory (recursively scanned).
  --json     Emit the machine-readable outline contract (v0.1).
  --match    Keep only the component with this exact name.
  --items    Restrict output to one section.
`;

process.exit(run(process.argv.slice(2)));
