import { Project, ts } from 'ts-morph';

/**
 * The three things a caller can learn about an edit's effect on type errors.
 *
 * `unknown` is the honest third state: the compiler could not be run, so the
 * edit is neither cleared nor condemned. Callers that gate on this must treat
 * `unknown` as a refusal — that is what keeps the ops fail-closed.
 */
export type TypeDelta = 'clean' | 'dirty' | 'unknown';

/**
 * Fail-closed type gate: report whether an edit introduces new semantic errors.
 *
 * Uses a diagnostic-count delta so the file's pre-existing errors (missing
 * imports, absent React types) cancel out — only errors the edit *adds* count
 * as `dirty`. If diagnostics cannot be computed for either side the result is
 * `unknown`, never `clean`; a caller cannot mistake "could not check" for
 * "checked and clean".
 *
 * @param count - internal seam, overridden only by this module's own tests to
 *   exercise the `unknown` branch. Callers should not pass it.
 */
export function checkTypeDelta(
  before: string,
  after: string,
  count: (code: string) => number | null = semanticErrorCount,
): TypeDelta {
  const beforeCount = count(before);
  const afterCount = count(after);
  if (beforeCount === null || afterCount === null) return 'unknown';
  return afterCount > beforeCount ? 'dirty' : 'clean';
}

/** Semantic error count, or `null` if the compiler could not produce one. */
function semanticErrorCount(code: string): number | null {
  try {
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        jsx: ts.JsxEmit.Preserve,
        strict: false,
        noEmit: true,
        skipLibCheck: true,
      },
    });
    project.createSourceFile('__check__.tsx', code);
    return project
      .getPreEmitDiagnostics()
      .filter((d) => d.getCategory() === ts.DiagnosticCategory.Error).length;
  } catch {
    return null;
  }
}
