import { createHash } from 'node:crypto';
import {
  closeSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { TextEdit } from './extract-component.types.js';

/** Short content hash — the same stale-guard identity `extractComponent` uses. */
export function hashSource(code: string): string {
  return createHash('sha256').update(code).digest('hex').slice(0, 16);
}

/**
 * Apply non-overlapping text edits to a source string. Applied right-to-left so
 * that earlier offsets stay valid as later ones are spliced. Pure — the store
 * (disk) is never touched here.
 */
export function applyTextEdits(code: string, edits: TextEdit[]): string {
  const ordered = [...edits].sort((a, b) => b.start - a.start);
  let out = code;
  for (const edit of ordered) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }
  return out;
}

export interface ApplyEditsRequest {
  /** Path to the file the edits target. */
  file: string;
  edits: TextEdit[];
  /**
   * Hash of the source the edits were computed against. The file's *current*
   * contents must still hash to this, or the write is refused. This is the
   * stale re-check: edit offsets are only valid against that exact source.
   */
  expectedHash: string;
}

export type ApplyEditsResult =
  | { ok: true; hash: string; output: string }
  | { ok: false; reason: 'stale-hash' | 'read-failed' | 'write-failed' };

/**
 * Apply an `extractComponent` (or any) `TextEdit[]` to a file on disk,
 * fail-closed and atomically. The current file is re-read and re-hashed against
 * `expectedHash` (stale guard), then the result is written to a sibling temp
 * file and `rename`d over the original — so a crash mid-write leaves the
 * original untouched. On any failure the store is not mutated.
 */
export function applyEditsToFile(req: ApplyEditsRequest): ApplyEditsResult {
  let current: string;
  try {
    current = readFileSync(req.file, 'utf8');
  } catch {
    return { ok: false, reason: 'read-failed' };
  }
  if (hashSource(current) !== req.expectedHash) {
    return { ok: false, reason: 'stale-hash' };
  }

  const output = applyTextEdits(current, req.edits);
  const tmp = join(dirname(req.file), `.${basename(req.file)}.${process.pid}.tmp`);
  try {
    const fd = openSync(tmp, 'wx');
    try {
      writeSync(fd, output);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, req.file);
  } catch {
    try {
      unlinkSync(tmp);
    } catch {
      // temp file may not exist; the original is already safe either way.
    }
    return { ok: false, reason: 'write-failed' };
  }
  return { ok: true, hash: hashSource(output), output };
}
