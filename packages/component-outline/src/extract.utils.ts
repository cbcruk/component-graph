import type { SgNode } from '@ast-grep/napi';

const JSX_NODE_KINDS = new Set(['jsx_element', 'jsx_self_closing_element']);

const CONTENT_KINDS = new Set([
  'jsx_element',
  'jsx_self_closing_element',
  'jsx_expression',
  'jsx_text',
]);

const HOOK_RE = /^use([A-Z].*)?$/;

/** 1-based start line. */
export function startLine(node: SgNode): number {
  return node.range().start.line + 1;
}

/** 1-based end line. */
export function endLine(node: SgNode): number {
  return node.range().end.line + 1;
}

/** napi's `kind()` is branded (`Kinds`); narrow to a plain string for Set/compare. */
export function kindOf(node: SgNode): string {
  return String(node.kind());
}

export function isJsxNode(node: SgNode): boolean {
  return JSX_NODE_KINDS.has(kindOf(node));
}

export function contentChildren(node: SgNode): SgNode[] {
  return node.children().filter((c) => CONTENT_KINDS.has(kindOf(c)));
}

/** Drill through `(expr)` wrappers to the inner expression. */
export function unwrapParen(node: SgNode): SgNode {
  let current = node;
  while (current.kind() === 'parenthesized_expression') {
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

export function isHookIdentifier(name: string): boolean {
  return HOOK_RE.test(name);
}

export function classifyTag(tag: string): 'element' | 'component' {
  return /^[a-z]/.test(tag) && !tag.includes('.') ? 'element' : 'component';
}

export function stripTypeAnnotation(text: string): string {
  return text.replace(/^\s*:\s*/, '').trim();
}

export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function unquote(stringNode: SgNode): string {
  const fragment = stringNode.children().find((c) => c.kind() === 'string_fragment');
  if (fragment) return fragment.text();
  return stringNode.text().replace(/^['"`]/, '').replace(/['"`]$/, '');
}
