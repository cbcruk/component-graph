import type { SgNode } from '@ast-grep/napi';
import { kindOf } from './ast.js';

// Shared ast-grep machinery lives in `./ast.js` — see the note there. What
// remains here is outline-specific: line numbering and text normalisation the
// JSON contract needs, which the A layer has no use for.

const CONTENT_KINDS = new Set([
  'jsx_element',
  'jsx_self_closing_element',
  'jsx_expression',
  'jsx_text',
]);

/** 1-based start line. */
export function startLine(node: SgNode): number {
  return node.range().start.line + 1;
}

/** 1-based end line. */
export function endLine(node: SgNode): number {
  return node.range().end.line + 1;
}

export function contentChildren(node: SgNode): SgNode[] {
  return node.children().filter((c) => CONTENT_KINDS.has(kindOf(c)));
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
