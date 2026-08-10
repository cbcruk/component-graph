import type { SgNode } from '@ast-grep/napi';

/**
 * The ast-grep machinery both layers need.
 *
 * B's JSON contract is the interface A consumes for *data*, but A edits TSX and
 * therefore needs `SgNode`s to compute source ranges — which the contract does
 * not carry. Without this module A has no choice but to rebuild the same
 * walkers, and it did: `findRootJsx` existed twice, line-for-line.
 *
 * That matters most for `findRootJsx`, which *defines* what counts as a
 * component's JSX. Two copies means widening it here (say, to accept
 * `return cond ? <a/> : <b/>`) leaves A on the old definition, surfacing as
 * `component-has-no-jsx` on a file the outline describes happily.
 *
 * Published at `component-outline/ast`, deliberately apart from the package's
 * main entry point: the outline contract is what B promises, this is shared
 * machinery between the two layers.
 */

/** napi's `kind()` is branded (`Kinds`); narrow to a plain string for Set/compare. */
export function kindOf(node: SgNode): string {
  return String(node.kind());
}

/** Nested scopes that stop a free-var / root-jsx walk from descending. */
export const FUNCTION_BOUNDARY = new Set([
  'arrow_function',
  'function_declaration',
  'function_expression',
  'method_definition',
]);

/** JSX element nodes — the container kinds, excluding text/expression nodes. */
export const JSX_NODE_KINDS = new Set(['jsx_element', 'jsx_self_closing_element']);

export function isJsxNode(node: SgNode): boolean {
  return JSX_NODE_KINDS.has(kindOf(node));
}

/** Drill through `(expr)` wrappers to the inner expression. */
export function unwrapParen(node: SgNode): SgNode {
  let current = node;
  while (kindOf(current) === 'parenthesized_expression') {
    const inner = current.children().find((c) => c.isNamed());
    if (!inner) break;
    current = inner;
  }
  return current;
}

/** First meaningful child of a `{ ... }` jsx_expression, if any. */
export function namedChild(node: SgNode): SgNode | null {
  return node.children().find((c) => c.isNamed()) ?? null;
}

const HOOK_RE = /^use([A-Z].*)?$/;

export function isHookIdentifier(name: string): boolean {
  return HOOK_RE.test(name);
}

/**
 * The bare name a callee resolves to: `foo` for `foo()`, `bar` for `a.bar()`.
 * Callers apply their own predicate — hook naming, an HOC allow-list — rather
 * than each re-deriving the name.
 */
export function calleeName(callee: SgNode | null): string | null {
  if (!callee) return null;
  const k = kindOf(callee);
  if (k === 'identifier') return callee.text();
  if (k === 'member_expression') return callee.field('property')?.text() ?? null;
  return null;
}

/**
 * The single JSX subtree a component returns, or null if it has none.
 *
 * This is the definition of "the component's JSX" for both layers. Expression
 * bodies (`=> <div/>`) and the first `return` inside a block body both count;
 * nested function scopes are not descended into.
 */
export function findRootJsx(fnNode: SgNode): SgNode | null {
  const body = fnNode.field('body');
  if (!body) return null;

  if (kindOf(body) !== 'statement_block') {
    const jsx = unwrapParen(body);
    return isJsxNode(jsx) ? jsx : null;
  }

  let found: SgNode | null = null;
  const visit = (node: SgNode): void => {
    if (found) return;
    if (kindOf(node) === 'return_statement') {
      const arg = node.children().find((c) => c.isNamed());
      if (arg) {
        const jsx = unwrapParen(arg);
        if (isJsxNode(jsx)) found = jsx;
      }
      return;
    }
    for (const child of node.children()) {
      if (found) return;
      if (FUNCTION_BOUNDARY.has(kindOf(child))) continue;
      visit(child);
    }
  };

  for (const child of body.children()) {
    if (found) break;
    if (FUNCTION_BOUNDARY.has(kindOf(child))) continue;
    visit(child);
  }
  return found;
}
