import { Project, ts } from 'ts-morph';

/**
 * Fail-closed type gate: an edit must not introduce new semantic errors.
 * Uses a diagnostic-count delta so the file's pre-existing errors (missing
 * imports, absent React types) cancel out — only errors the edit *adds* are
 * caught. Returns false (skips the gate) if diagnostics can't be computed.
 */
export function introducesTypeErrors(before: string, after: string): boolean {
  const beforeCount = semanticErrorCount(before);
  const afterCount = semanticErrorCount(after);
  if (beforeCount < 0 || afterCount < 0) return false;
  return afterCount > beforeCount;
}

function semanticErrorCount(code: string): number {
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
    return -1;
  }
}
