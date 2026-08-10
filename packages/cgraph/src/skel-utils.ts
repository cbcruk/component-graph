import type { SkelNode } from 'component-outline';

/**
 * True when the outline subtree contains an element or component tagged `tag`.
 *
 * Both `extractComponent`'s verify (is the new usage wired in?) and
 * `verifyExtraction`'s (is the new component actually referenced?) ask this, and
 * previously carried byte-identical private copies under different names.
 */
export function containsTag(node: SkelNode, tag: string): boolean {
  if ((node.kind === 'component' || node.kind === 'element') && node.tag === tag) {
    return true;
  }
  if (node.kind === 'element' || node.kind === 'component' || node.kind === 'fragment') {
    return node.children.some((c) => containsTag(c, tag));
  }
  return false;
}
