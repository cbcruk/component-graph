import { type SgNode } from '@ast-grep/napi';
import { kindOf } from 'component-outline/ast';

// `kindOf`, `findRootJsx`, `unwrapParen`, `isJsxNode`, `JSX_NODE_KINDS`,
// `FUNCTION_BOUNDARY` and `calleeName` come from `component-outline/ast`, which
// owns them — this package used to carry its own copies, and `findRootJsx`
// (which *defines* what counts as a component's JSX) had drifted into a
// second, independently maintained definition. What remains here is specific to
// the editing layer.

/** Parents whose identifier child is a tag name, not a value reference. */
export const TAG_PARENT_KINDS = new Set([
  'jsx_opening_element',
  'jsx_self_closing_element',
  'jsx_closing_element',
]);

/**
 * The function/arrow node for a top-level component named `name`, or null.
 * Handles `function X() {}` and `const X = () => {}` (incl. `export`ed).
 */
export function locateComponentFn(root: SgNode, name: string): SgNode | null {
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

/**
 * Every name bound by a nested scope inside `node` — parameters and variable
 * declarators at any depth. Both edit ops need this to tell a free reference
 * from one the subtree binds itself, and both fail closed when a name is both.
 */
export function collectBoundNames(node: SgNode): Set<string> {
  const bound = new Set<string>();
  const visit = (n: SgNode): void => {
    const k = kindOf(n);
    if (k === 'formal_parameters') {
      for (const p of n.children()) {
        const pattern = kindOf(p).endsWith('_parameter') ? p.field('pattern') : p;
        collectPatternNames(pattern).forEach((x) => bound.add(x));
      }
    } else if (k === 'variable_declarator') {
      collectPatternNames(n.field('name')).forEach((x) => bound.add(x));
    }
    n.children().forEach(visit);
  };
  visit(node);
  return bound;
}

export interface Reference {
  node: SgNode;
  name: string;
  /** `{ count }` in an object literal — a reference that is also its own key. */
  shorthand: boolean;
  /** A JSX tag name rather than a value reference. */
  isTag: boolean;
}

/**
 * Walk identifier references inside `node` in source order. Return `false` from
 * `visit` to stop early.
 *
 * Tag names are reported with `isTag` set rather than skipped: `extractComponent`
 * needs them to detect a cyclic `<NewName />` inside the target, while everything
 * else ignores them. Filtering here would silently drop that check.
 *
 * The ops disagree on what a reference *means* — extract turns it into a prop,
 * inline substitutes the argument text — but agreeing on what counts as one is
 * what keeps them inverses.
 */
export function forEachReference(
  node: SgNode,
  visit: (ref: Reference) => boolean | void,
): void {
  let stopped = false;
  const walk = (n: SgNode): void => {
    if (stopped) return;
    const k = kindOf(n);
    if (k === 'identifier' || k === 'shorthand_property_identifier') {
      const parent = n.parent();
      if (
        visit({
          node: n,
          name: n.text(),
          shorthand: k === 'shorthand_property_identifier',
          isTag: parent ? TAG_PARENT_KINDS.has(kindOf(parent)) : false,
        }) === false
      ) {
        stopped = true;
        return;
      }
    }
    n.children().forEach(walk);
  };
  walk(node);
}

/** All binding names introduced by a (possibly destructuring) pattern. */
export function collectPatternNames(pattern: SgNode | null): string[] {
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
