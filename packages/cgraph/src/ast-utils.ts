import { type SgNode } from '@ast-grep/napi';

/** Grammar kind of a node as a plain string. */
export const kindOf = (node: SgNode): string => String(node.kind());

/** Nested scopes that stop a free-var / root-jsx walk from descending. */
export const FUNCTION_BOUNDARY = new Set([
  'arrow_function',
  'function_declaration',
  'function_expression',
  'method_definition',
]);

/** JSX nodes that can be a legal extraction/inline target (element containers). */
export const TARGET_KINDS = new Set(['jsx_element', 'jsx_self_closing_element']);

/** Parents whose identifier child is a tag name, not a value reference. */
export const TAG_PARENT_KINDS = new Set([
  'jsx_opening_element',
  'jsx_self_closing_element',
  'jsx_closing_element',
]);

/** Peel `(expr)` wrappers to the inner named node. */
export function unwrapParen(node: SgNode): SgNode {
  let current = node;
  while (kindOf(current) === 'parenthesized_expression') {
    const inner = current.children().find((c) => c.isNamed());
    if (!inner) break;
    current = inner;
  }
  return current;
}

export function isJsxContainer(node: SgNode): boolean {
  const k = kindOf(node);
  return k === 'jsx_element' || k === 'jsx_self_closing_element';
}

/** The single JSX subtree a component returns, or null if it has none. */
export function findRootJsx(fnNode: SgNode): SgNode | null {
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
