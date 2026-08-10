import { Project, type SourceFile, ts } from 'ts-morph';

/**
 * The single compiler configuration for every Tier 1 pass.
 *
 * Both passes — prop-type resolution and the diagnostic-delta gate — must agree
 * on `strict`, or the gate cannot see the errors the resolver's types imply: a
 * strict-only error would be resolved into a generated prop type and then walk
 * straight through a non-strict gate.
 *
 * `noImplicitAny` is the one strict flag held off, and the delta is why. With no
 * React types in scope every intrinsic element raises TS7026 ("no interface
 * 'JSX.IntrinsicElements'") and every unannotated param raises TS7006 — ambient
 * noise that scales with *element count*. A freehand candidate that legitimately
 * adds one `<span>` would add one more TS7026 and read as `dirty`, so the gate
 * would refuse a valid edit. The flag changes only what is reported, never what
 * is inferred, so prop-type resolution is unaffected by holding it off.
 *
 * The rest of `strict` — `strictNullChecks` above all — stays on. Those are the
 * strict-only errors the gate exists to catch, and they do not scale with the
 * size of the edit.
 */
export const COMPILER_OPTIONS: ts.CompilerOptions = {
  jsx: ts.JsxEmit.Preserve,
  strict: true,
  noImplicitAny: false,
  noEmit: true,
  skipLibCheck: true,
};

/**
 * A single-file in-memory project under {@link COMPILER_OPTIONS}. No index, no
 * disk, no tsconfig discovery — consistent with parse-now/no-index.
 */
export function createCheckFile(fileName: string, code: string): SourceFile {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: COMPILER_OPTIONS,
  });
  return project.createSourceFile(fileName, code);
}
