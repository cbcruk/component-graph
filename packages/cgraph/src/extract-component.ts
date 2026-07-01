import { createHash } from 'node:crypto';
import { parse, Lang, type SgNode } from '@ast-grep/napi';
import { Project, ts } from 'ts-morph';
import { extract, type SkelNode } from 'component-outline';
import type {
  ExtractComponentFailure,
  ExtractComponentRequest,
  ExtractComponentResult,
  ExtractedProp,
  PropOrigin,
  TextEdit,
} from './extract-component.types.js';

const FUNCTION_BOUNDARY = new Set([
  'arrow_function',
  'function_declaration',
  'function_expression',
  'method_definition',
]);
// Only element containers are extractable: a bare `{expr}` or text node would
// produce an invalid `return ( {expr} )`. An element that *contains* opaque
// exprs is fine — it moves whole, interior untouched.
const TARGET_KINDS = new Set(['jsx_element', 'jsx_self_closing_element']);
const TAG_PARENT_KINDS = new Set([
  'jsx_opening_element',
  'jsx_self_closing_element',
  'jsx_closing_element',
]);

const kindOf = (node: SgNode): string => String(node.kind());
const sha = (code: string): string =>
  createHash('sha256').update(code).digest('hex').slice(0, 16);
const fail = (reason: ExtractComponentFailure): ExtractComponentResult => ({
  ok: false,
  reason,
});

/**
 * The marquee op. Extract a JSX subtree into a new sibling component, inferring
 * its props from the free variables the subtree references (typed via Tier 1),
 * rewiring the original to a single usage. Fail-closed: any guard failing means
 * no edit is produced. Opaque `expr` subtrees move whole — their interior is
 * carried verbatim, never rewritten.
 */
export function extractComponent(
  req: ExtractComponentRequest,
): ExtractComponentResult {
  const hash = sha(req.code);
  if (req.expectedHash && req.expectedHash !== hash) return fail('stale-hash');
  if (!isPascalIdentifier(req.newName)) return fail('invalid-name');

  const root = parse(Lang.Tsx, req.code).root();
  if (topLevelNameExists(root, req.newName)) return fail('name-collision');

  const fnNode = locateComponentFn(root, req.component);
  if (!fnNode) return fail('component-not-found');

  const rootJsx = findRootJsx(fnNode);
  if (!rootJsx) return fail('component-has-no-jsx');

  const target = findTargetJsx(rootJsx, req.targetLine);
  if (!target) return fail('target-not-found');
  if (target.id() === rootJsx.id()) return fail('target-is-root');

  const localScope = collectLocalScope(fnNode);
  const analysis = analyzeFreeVars(target, localScope, req.newName);
  if (analysis.referencesNewName) return fail('cyclic');

  const props = resolveTypes(req, localScope, analysis.props);

  const targetStart = target.range().start.index;
  const targetEnd = target.range().end.index;
  const targetText = req.code.slice(targetStart, targetEnd);
  const usage = buildUsage(req.newName, props);
  const newComponent = buildNewComponent(req.newName, props, targetText);
  const insertAt = enclosingRangeEnd(root, req.component);

  const edits: TextEdit[] = [
    { start: targetStart, end: targetEnd, text: usage },
    { start: insertAt, end: insertAt, text: `\n\n${newComponent}\n` },
  ];
  const output = applyEdits(req.code, edits);

  const verdict = verify(req.code, output, req.component, req.newName, props);
  if (verdict) return fail(verdict);

  return {
    ok: true,
    output,
    newComponent,
    usage,
    props,
    edits,
    hash: sha(output),
  };
}

export { sha as hashSource };

function isPascalIdentifier(name: string): boolean {
  return /^[A-Z][A-Za-z0-9]*$/.test(name);
}

function topLevelNameExists(root: SgNode, name: string): boolean {
  return root.children().some((node) => declaredNames(node).includes(name));
}

function declaredNames(node: SgNode): string[] {
  const names: string[] = [];
  const collect = (n: SgNode): void => {
    const k = kindOf(n);
    if (k === 'function_declaration') {
      const nm = n.field('name');
      if (nm) names.push(nm.text());
    } else if (k === 'lexical_declaration' || k === 'variable_declaration') {
      for (const d of n.children()) {
        if (kindOf(d) !== 'variable_declarator') continue;
        const nm = d.field('name');
        if (nm && kindOf(nm) === 'identifier') names.push(nm.text());
      }
    }
  };
  if (kindOf(node) === 'export_statement') node.children().forEach(collect);
  else collect(node);
  return names;
}

function locateComponentFn(root: SgNode, name: string): SgNode | null {
  for (const node of root.children()) {
    const children = kindOf(node) === 'export_statement' ? node.children() : [node];
    for (const child of children) {
      const k = kindOf(child);
      if (k === 'function_declaration' && child.field('name')?.text() === name) {
        return child;
      }
      if (k === 'lexical_declaration' || k === 'variable_declaration') {
        for (const d of child.children()) {
          if (kindOf(d) !== 'variable_declarator') continue;
          if (d.field('name')?.text() !== name) continue;
          const value = d.field('value');
          if (value && kindOf(value) === 'arrow_function') return value;
        }
      }
    }
  }
  return null;
}

function enclosingRangeEnd(root: SgNode, name: string): number {
  for (const node of root.children()) {
    if (declaredNames(node).includes(name)) return node.range().end.index;
  }
  return root.range().end.index;
}

function findRootJsx(fnNode: SgNode): SgNode | null {
  const body = fnNode.field('body');
  if (!body) return null;
  if (kindOf(body) !== 'statement_block') {
    const jsx = unwrapParen(body);
    return isJsxContainer(jsx) ? jsx : null;
  }
  let found: SgNode | null = null;
  const visit = (n: SgNode): void => {
    if (found) return;
    if (kindOf(n) === 'return_statement') {
      const arg = n.children().find((c) => c.isNamed());
      if (arg) {
        const jsx = unwrapParen(arg);
        if (isJsxContainer(jsx)) found = jsx;
      }
      return;
    }
    for (const c of n.children()) {
      if (found) return;
      if (FUNCTION_BOUNDARY.has(kindOf(c))) continue;
      visit(c);
    }
  };
  for (const c of body.children()) {
    if (found) break;
    if (FUNCTION_BOUNDARY.has(kindOf(c))) continue;
    visit(c);
  }
  return found;
}

/** Outermost JSX node whose start line matches, searching within the root. */
function findTargetJsx(rootJsx: SgNode, line: number): SgNode | null {
  let found: SgNode | null = null;
  const visit = (n: SgNode): void => {
    if (found) return;
    if (TARGET_KINDS.has(kindOf(n)) && n.range().start.line + 1 === line) {
      found = n;
      return;
    }
    for (const c of n.children()) visit(c);
  };
  visit(rootJsx);
  return found;
}

function unwrapParen(node: SgNode): SgNode {
  let current = node;
  while (kindOf(current) === 'parenthesized_expression') {
    const inner = current.children().find((c) => c.isNamed());
    if (!inner) break;
    current = inner;
  }
  return current;
}

function isJsxContainer(node: SgNode): boolean {
  const k = kindOf(node);
  return k === 'jsx_element' || k === 'jsx_self_closing_element';
}

function collectLocalScope(fnNode: SgNode): Map<string, PropOrigin> {
  const scope = new Map<string, PropOrigin>();

  const params = fnNode.field('parameters');
  if (params) {
    const items =
      kindOf(params) === 'formal_parameters'
        ? params.children().filter((c) => kindOf(c).endsWith('_parameter'))
        : [params];
    for (const item of items) {
      const pattern =
        kindOf(item).endsWith('_parameter') ? item.field('pattern') : item;
      collectPatternNames(pattern).forEach((n) => scope.set(n, 'param'));
    }
  }

  const body = fnNode.field('body');
  if (body && kindOf(body) === 'statement_block') {
    for (const stmt of body.children()) {
      const k = kindOf(stmt);
      if (k === 'lexical_declaration' || k === 'variable_declaration') {
        for (const d of stmt.children()) {
          if (kindOf(d) !== 'variable_declarator') continue;
          const origin: PropOrigin = isHookCall(d.field('value')) ? 'hook' : 'local';
          collectPatternNames(d.field('name')).forEach((n) => scope.set(n, origin));
        }
      } else if (k === 'function_declaration') {
        const nm = stmt.field('name');
        if (nm) scope.set(nm.text(), 'local');
      }
    }
  }
  return scope;
}

function collectPatternNames(pattern: SgNode | null): string[] {
  if (!pattern) return [];
  const k = kindOf(pattern);
  if (k === 'identifier' || k === 'shorthand_property_identifier_pattern') {
    return [pattern.text()];
  }
  const names: string[] = [];
  const visit = (n: SgNode): void => {
    const nk = kindOf(n);
    if (nk === 'shorthand_property_identifier_pattern') {
      names.push(n.text());
    } else if (nk === 'pair_pattern') {
      collectPatternNames(n.field('value')).forEach((x) => names.push(x));
    } else if (nk === 'object_assignment_pattern') {
      collectPatternNames(n.field('left')).forEach((x) => names.push(x));
    } else if (nk === 'rest_pattern') {
      const id = n.children().find((c) => kindOf(c) === 'identifier');
      if (id) names.push(id.text());
    } else if (nk === 'identifier' && n.id() !== pattern.id()) {
      names.push(n.text());
    } else {
      n.children().forEach(visit);
    }
  };
  pattern.children().forEach(visit);
  return names;
}

function isHookCall(value: SgNode | null): boolean {
  if (!value || kindOf(value) !== 'call_expression') return false;
  const callee = value.field('function');
  if (!callee) return false;
  const name =
    kindOf(callee) === 'member_expression'
      ? callee.field('property')?.text()
      : callee.text();
  return name ? /^use([A-Z].*)?$/.test(name) : false;
}

interface FreeVarAnalysis {
  props: string[];
  referencesNewName: boolean;
}

function analyzeFreeVars(
  target: SgNode,
  localScope: Map<string, PropOrigin>,
  newName: string,
): FreeVarAnalysis {
  const boundWithin = new Set<string>();
  const bindVisit = (n: SgNode): void => {
    const k = kindOf(n);
    if (k === 'formal_parameters') {
      for (const p of n.children()) {
        const pattern = kindOf(p).endsWith('_parameter') ? p.field('pattern') : p;
        collectPatternNames(pattern).forEach((x) => boundWithin.add(x));
      }
    } else if (k === 'variable_declarator') {
      collectPatternNames(n.field('name')).forEach((x) => boundWithin.add(x));
    }
    n.children().forEach(bindVisit);
  };
  bindVisit(target);

  const props: string[] = [];
  const seen = new Set<string>();
  let referencesNewName = false;
  const refVisit = (n: SgNode): void => {
    if (kindOf(n) === 'identifier') {
      const parent = n.parent();
      const isTag = parent ? TAG_PARENT_KINDS.has(kindOf(parent)) : false;
      const name = n.text();
      if (name === newName) referencesNewName = true;
      if (!isTag && !boundWithin.has(name) && localScope.has(name) && !seen.has(name)) {
        seen.add(name);
        props.push(name);
      }
    }
    n.children().forEach(refVisit);
  };
  refVisit(target);

  return { props, referencesNewName };
}

function resolveTypes(
  req: ExtractComponentRequest,
  localScope: Map<string, PropOrigin>,
  propNames: string[],
): ExtractedProp[] {
  const origins = new Map(propNames.map((n) => [n, localScope.get(n) ?? 'local']));
  let types: Map<string, string> | null = null;
  try {
    types = resolveTypesWithTsMorph(req, propNames);
  } catch {
    types = null;
  }
  return propNames.map((name) => ({
    name,
    typeText: types?.get(name) ?? 'unknown',
    origin: origins.get(name) as PropOrigin,
  }));
}

function resolveTypesWithTsMorph(
  req: ExtractComponentRequest,
  propNames: string[],
): Map<string, string> {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      jsx: ts.JsxEmit.Preserve,
      strict: true,
      noEmit: true,
      skipLibCheck: true,
    },
  });
  const file = req.file.endsWith('.tsx') ? req.file : 'in.tsx';
  const sf = project.createSourceFile(file, req.code);
  const wanted = new Set(propNames);
  const out = new Map<string, string>();

  for (const be of sf.getDescendantsOfKind(ts.SyntaxKind.BindingElement)) {
    const name = be.getName();
    if (wanted.has(name) && !out.has(name)) out.set(name, cleanType(be.getType().getText(be)));
  }
  for (const vd of sf.getDescendantsOfKind(ts.SyntaxKind.VariableDeclaration)) {
    const name = vd.getName();
    if (wanted.has(name) && !out.has(name)) out.set(name, cleanType(vd.getType().getText(vd)));
  }
  for (const pd of sf.getDescendantsOfKind(ts.SyntaxKind.Parameter)) {
    const name = pd.getName();
    if (wanted.has(name) && !out.has(name)) out.set(name, cleanType(pd.getType().getText(pd)));
  }
  return out;
}

function cleanType(text: string): string {
  const t = text.trim();
  if (!t || t === 'any' || t === 'error') return 'unknown';
  return t;
}

function buildUsage(name: string, props: ExtractedProp[]): string {
  if (props.length === 0) return `<${name} />`;
  const attrs = props.map((p) => `${p.name}={${p.name}}`).join(' ');
  return `<${name} ${attrs} />`;
}

function buildNewComponent(
  name: string,
  props: ExtractedProp[],
  bodyJsx: string,
): string {
  const body = bodyJsx
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
  if (props.length === 0) {
    return `function ${name}() {\n  return (\n${body}\n  );\n}`;
  }
  const destructure = props.map((p) => p.name).join(', ');
  const typeLines = props.map((p) => `  ${p.name}: ${p.typeText};`).join('\n');
  return (
    `function ${name}({ ${destructure} }: {\n${typeLines}\n}) {\n` +
    `  return (\n${body}\n  );\n}`
  );
}

function applyEdits(code: string, edits: TextEdit[]): string {
  const ordered = [...edits].sort((a, b) => b.start - a.start);
  let out = code;
  for (const edit of ordered) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }
  return out;
}

function verify(
  before: string,
  output: string,
  componentName: string,
  newName: string,
  props: ExtractedProp[],
): ExtractComponentFailure | null {
  const outline = extract('__verify__.tsx', output);
  const newComp = outline.components.find((c) => c.name === newName);
  if (!newComp) return 'verify-missing-new-component';

  const boundProps = new Set(
    newComp.params.flatMap((p) => p.props.map((b) => b.name)),
  );
  for (const p of props) {
    if (!boundProps.has(p.name)) return 'verify-prop-mismatch';
  }

  const enclosing = outline.components.find((c) => c.name === componentName);
  if (!enclosing || !enclosing.root) return 'verify-missing-original';
  if (!containsComponentTag(enclosing.root, newName)) return 'verify-usage-missing';

  if (introducesTypeErrors(before, output)) return 'type-check-failed';
  return null;
}

function containsComponentTag(node: SkelNode, tag: string): boolean {
  if ((node.kind === 'component' || node.kind === 'element') && node.tag === tag) {
    return true;
  }
  if (node.kind === 'element' || node.kind === 'component' || node.kind === 'fragment') {
    return node.children.some((c) => containsComponentTag(c, tag));
  }
  return false;
}

/**
 * Fail-closed type gate: the edit must not introduce new semantic errors.
 * Uses a diagnostic-count delta so the file's pre-existing errors (missing
 * imports, absent React types) cancel out — only errors the extraction *adds*
 * are caught. Returns false (skips the gate) if diagnostics can't be computed.
 */
function introducesTypeErrors(before: string, after: string): boolean {
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
