import type { SkelNode } from './outline.types.js';

/**
 * Traversal over the contract's own tree. Owned here because this package
 * defines `SkelNode`: the A layer and the eval harness both walk it looking for
 * a tag, and each had grown its own copy — `containsTag`, `containsComponentTag`
 * and `countTag`, three implementations that had already drifted on whether to
 * descend into fragments.
 */

/** How many elements/components in the subtree carry `tag`. */
export function countTag(node: SkelNode, tag: string): number {
  const self =
    (node.kind === 'component' || node.kind === 'element') && node.tag === tag ? 1 : 0;
  if (node.kind === 'element' || node.kind === 'component' || node.kind === 'fragment') {
    return self + node.children.reduce((n, child) => n + countTag(child, tag), 0);
  }
  return self;
}

/** Whether any element/component in the subtree carries `tag`. Short-circuits. */
export function containsTag(node: SkelNode, tag: string): boolean {
  if ((node.kind === 'component' || node.kind === 'element') && node.tag === tag) {
    return true;
  }
  if (node.kind === 'element' || node.kind === 'component' || node.kind === 'fragment') {
    return node.children.some((child) => containsTag(child, tag));
  }
  return false;
}
