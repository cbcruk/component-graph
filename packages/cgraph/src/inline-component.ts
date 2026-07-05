import { parse, Lang, type SgNode } from '@ast-grep/napi';
import { extract } from 'component-outline';
import { applyTextEdits, hashSource } from './apply-edits.js';
import {
  TAG_PARENT_KINDS,
  TARGET_KINDS,
  collectPatternNames,
  findRootJsx,
  kindOf,
  locateComponentFn,
} from './ast-utils.js';
import { introducesTypeErrors } from './type-gate.js';
import type { TextEdit } from './extract-component.types.js';
import type {
  InlineComponentFailure,
  InlineComponentRequest,
  InlineComponentResult,
} from './inline-component.types.js';

const fail = (reason: InlineComponentFailure): InlineComponentResult => ({
  ok: false,
  reason,
});

/**
 * The inverse of `extractComponent`. Fold a single-usage top-level component
 * back into its call site: substitute each prop reference in the component's
 * body with the argument the usage passed, drop the body where the usage was,
 * and delete the now-dead declaration. Fail-closed: any guard failing yields no
 * edit. `extract` then `inline` is identity — the GetPut round-trip law.
 */
export function inlineComponent(
  req: InlineComponentRequest,
): InlineComponentResult {
  const hash = hashSource(req.code);
  if (req.expectedHash && req.expectedHash !== hash) return fail('stale-hash');

  const root = parse(Lang.Tsx, req.code).root();

  const targetFn = locateTopLevelFunction(root, req.target);
  if (!targetFn) {
    // Distinguish "exists but as an arrow/const" from "not there at all".
    return locateComponentFn(root, req.target)
      ? fail('unsupported-target-kind')
      : fail('target-not-found');
  }
  if (isExported(targetFn)) return fail('unsupported-exported-target');

  const targetBody = findRootJsx(targetFn);
  if (!targetBody) return fail('target-has-no-jsx');

  const enclosingFn = locateComponentFn(root, req.component);
  if (!enclosingFn) return fail('component-not-found');

  const usages = findUsages(root, req.target);
  if (usages.length !== 1) return fail('not-single-usage');
  const usage = usages[0]!;
  if (!isDescendantOf(usage, enclosingFn)) return fail('usage-not-in-component');

  const attrs = readAttributes(usage);
  if (attrs === 'spread') return fail('unsupported-spread');
  if (hasJsxChildren(usage)) return fail('unsupported-children');

  const propNames = collectPatternNames(paramPattern(targetFn));
  for (const name of propNames) {
    if (!(name in attrs)) return fail('unsupported-partial-props');
  }

  const sub = planSubstitutions(targetBody, propNames, attrs);
  if (sub === 'shorthand') return fail('unsupported-shorthand-prop');
  if (sub === 'shadow') return fail('unsupported-shadowing');

  const inlined = renderInlined(req.code, targetBody, sub.edits);

  const usageStart = usage.range().start.index;
  const usageEnd = usage.range().end.index;
  const delStart = trimBackWhitespace(req.code, targetFn.range().start.index);
  const delEnd = targetFn.range().end.index;

  const edits: TextEdit[] = [
    { start: usageStart, end: usageEnd, text: inlined },
    { start: delStart, end: delEnd, text: '' },
  ];
  const output = applyTextEdits(req.code, edits);

  const verdict = verify(req.code, output, req.target);
  if (verdict) return fail(verdict);

  return {
    ok: true,
    output,
    inlined,
    substitutions: sub.substitutions,
    edits,
    hash: hashSource(output),
  };
}

function locateTopLevelFunction(root: SgNode, name: string): SgNode | null {
  for (const node of root.children()) {
    const candidates = kindOf(node) === 'export_statement' ? node.children() : [node];
    for (const c of candidates) {
      if (kindOf(c) === 'function_declaration' && c.field('name')?.text() === name) {
        return c;
      }
    }
  }
  return null;
}

function isExported(fnNode: SgNode): boolean {
  return kindOf(fnNode.parent() ?? fnNode) === 'export_statement';
}

function paramPattern(fnNode: SgNode): SgNode | null {
  const params = fnNode.field('parameters');
  if (!params) return null;
  if (kindOf(params) !== 'formal_parameters') return params;
  const first = params.children().find((c) => kindOf(c).endsWith('_parameter'));
  return first ? first.field('pattern') : null;
}

function tagName(node: SgNode): string | null {
  if (kindOf(node) === 'jsx_self_closing_element') {
    return node.field('name')?.text() ?? null;
  }
  const opening = node.children().find((c) => kindOf(c) === 'jsx_opening_element');
  return opening?.field('name')?.text() ?? null;
}

function findUsages(root: SgNode, name: string): SgNode[] {
  const out: SgNode[] = [];
  const visit = (n: SgNode): void => {
    if (TARGET_KINDS.has(kindOf(n)) && tagName(n) === name) out.push(n);
    for (const c of n.children()) visit(c);
  };
  visit(root);
  return out;
}

function isDescendantOf(node: SgNode, ancestor: SgNode): boolean {
  let cur = node.parent();
  while (cur) {
    if (cur.id() === ancestor.id()) return true;
    cur = cur.parent();
  }
  return false;
}

/** The container node whose children hold the JSX attributes. */
function attributeHost(node: SgNode): SgNode {
  if (kindOf(node) === 'jsx_self_closing_element') return node;
  return node.children().find((c) => kindOf(c) === 'jsx_opening_element') ?? node;
}

/**
 * Map of attribute name → argument expression text, or 'spread' if the usage
 * carries a `{...rest}` we can't honestly distribute.
 */
function readAttributes(usage: SgNode): Record<string, string> | 'spread' {
  const host = attributeHost(usage);
  const attrs: Record<string, string> = {};
  for (const child of host.children()) {
    const k = kindOf(child);
    if (k === 'jsx_attribute') {
      const named = child.children().filter((c) => c.isNamed());
      const name = named[0]?.text();
      if (!name) continue;
      const value = named[1];
      attrs[name] = argText(value);
    } else if (k === 'jsx_expression') {
      // A bare `{...spread}` sitting among the attributes.
      return 'spread';
    }
  }
  return attrs;
}

function argText(value: SgNode | undefined): string {
  if (!value) return 'true'; // boolean shorthand: `<X flag />`
  if (kindOf(value) === 'jsx_expression') {
    const inner = value.children().find((c) => c.isNamed());
    return inner ? inner.text() : 'undefined';
  }
  return value.text(); // string literal keeps its quotes
}

function hasJsxChildren(usage: SgNode): boolean {
  if (kindOf(usage) === 'jsx_self_closing_element') return false;
  return usage.children().some((c) => {
    const k = kindOf(c);
    if (k === 'jsx_opening_element' || k === 'jsx_closing_element') return false;
    if (k === 'jsx_text') return c.text().trim().length > 0;
    return c.isNamed();
  });
}

interface SubstitutionPlan {
  edits: TextEdit[];
  substitutions: Record<string, string>;
}

/**
 * Plan the in-body replacements: every reference to a prop name becomes the
 * argument text. Returns 'shadow' if a prop is re-bound inside the body (the
 * reference is then ambiguous) or 'shorthand' if a prop appears as an object
 * shorthand we can't rewrite to an expression — both fail-closed.
 */
function planSubstitutions(
  body: SgNode,
  propNames: string[],
  attrs: Record<string, string>,
): SubstitutionPlan | 'shadow' | 'shorthand' {
  const props = new Set(propNames);

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
  bindVisit(body);

  const edits: TextEdit[] = [];
  const substitutions: Record<string, string> = {};
  let bad: 'shadow' | 'shorthand' | null = null;
  const refVisit = (n: SgNode): void => {
    if (bad) return;
    const k = kindOf(n);
    if (k === 'shorthand_property_identifier' && props.has(n.text())) {
      bad = 'shorthand';
      return;
    }
    if (k === 'identifier' && props.has(n.text())) {
      const parent = n.parent();
      const isTag = parent ? TAG_PARENT_KINDS.has(kindOf(parent)) : false;
      if (!isTag) {
        if (boundWithin.has(n.text())) {
          bad = 'shadow';
          return;
        }
        const name = n.text();
        const text = attrs[name]!;
        edits.push({ start: n.range().start.index, end: n.range().end.index, text });
        substitutions[name] = text;
      }
    }
    n.children().forEach(refVisit);
  };
  refVisit(body);
  if (bad) return bad;
  return { edits, substitutions };
}

/** Apply the in-body substitutions to the body's source slice. */
function renderInlined(code: string, body: SgNode, edits: TextEdit[]): string {
  const start = body.range().start.index;
  const end = body.range().end.index;
  const local = edits.map((e) => ({
    start: e.start - start,
    end: e.end - start,
    text: e.text,
  }));
  return applyTextEdits(code.slice(start, end), local);
}

/** Walk `start` backwards over whitespace to swallow the blank lines before a decl. */
function trimBackWhitespace(code: string, start: number): number {
  let i = start;
  while (i > 0 && /\s/.test(code[i - 1]!)) i--;
  return i;
}

function verify(
  before: string,
  output: string,
  target: string,
): InlineComponentFailure | null {
  const outline = extract('__verify__.tsx', output);
  if (outline.components.some((c) => c.name === target)) {
    return 'verify-target-still-present';
  }
  if (findUsages(parse(Lang.Tsx, output).root(), target).length > 0) {
    return 'verify-usage-still-present';
  }
  if (introducesTypeErrors(before, output)) return 'type-check-failed';
  return null;
}
