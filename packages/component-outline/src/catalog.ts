import type { SgNode } from '@ast-grep/napi';
import type { SymbolType } from './outline.types.js';
import { kindOf, unwrapParen } from './extract.utils.js';

/**
 * A component declaration recognized by the catalog. `fnNode` is the
 * function-ish node (function_declaration / function_expression /
 * arrow_function) whose params and body get read uniformly downstream.
 * `wrappers` is the HOC chain around it, outermost first.
 */
export interface ShapeReading {
  name: string | null;
  symbolType: SymbolType;
  fnNode: SgNode;
  wrappers: string[];
}

/**
 * Reads zero or more component shapes from one (export-unwrapped) declaration
 * node. Coverage grows by adding readers here — not by branching the walker.
 */
export type ComponentReader = (node: SgNode) => ShapeReading[];

/** Higher-order component callees recognized by name. Extend = add an entry. */
const HOC_NAMES = new Set(['memo', 'forwardRef']);

const FUNCTION_KINDS = new Set([
  'arrow_function',
  'function_expression',
  'function_declaration',
]);

function symbolTypeOf(fnNode: SgNode): SymbolType {
  return kindOf(fnNode) === 'arrow_function' ? 'arrow-component' : 'function-component';
}

function hocName(callee: SgNode | null): string | null {
  if (!callee) return null;
  if (kindOf(callee) === 'identifier') {
    return HOC_NAMES.has(callee.text()) ? callee.text() : null;
  }
  if (kindOf(callee) === 'member_expression') {
    const prop = callee.field('property');
    if (prop && HOC_NAMES.has(prop.text())) return prop.text();
  }
  return null;
}

interface FunctionTarget {
  fnNode: SgNode;
  wrappers: string[];
}

/** Drill through `memo(...)`/`forwardRef(...)` wrappers to the inner function. */
export function unwrapToFunction(node: SgNode): FunctionTarget | null {
  const wrappers: string[] = [];
  let current = unwrapParen(node);

  for (;;) {
    const kind = kindOf(current);
    if (FUNCTION_KINDS.has(kind)) {
      return { fnNode: current, wrappers };
    }
    if (kind === 'call_expression') {
      const name = hocName(current.field('function'));
      if (!name) return null;
      const args = current.field('arguments');
      const inner = args
        ? args.children().find((c) => FUNCTION_KINDS.has(kindOf(c)) || kindOf(c) === 'call_expression')
        : undefined;
      if (!inner) return null;
      wrappers.push(name);
      current = unwrapParen(inner);
      continue;
    }
    return null;
  }
}

const readFunctionDeclaration: ComponentReader = (node) => {
  if (kindOf(node) !== 'function_declaration') return [];
  const name = node.field('name');
  return [
    {
      name: name ? name.text() : null,
      symbolType: 'function-component',
      fnNode: node,
      wrappers: [],
    },
  ];
};

const readVariableComponent: ComponentReader = (node) => {
  const kind = kindOf(node);
  if (kind !== 'lexical_declaration' && kind !== 'variable_declaration') return [];
  const out: ShapeReading[] = [];
  for (const declarator of node.children()) {
    if (kindOf(declarator) !== 'variable_declarator') continue;
    const value = declarator.field('value');
    if (!value) continue;
    const target = unwrapToFunction(value);
    if (!target) continue;
    const name = declarator.field('name');
    out.push({
      name: name ? name.text() : null,
      symbolType: symbolTypeOf(target.fnNode),
      fnNode: target.fnNode,
      wrappers: target.wrappers,
    });
  }
  return out;
};

export const CATALOG: ComponentReader[] = [
  readFunctionDeclaration,
  readVariableComponent,
];

export function runCatalog(node: SgNode): ShapeReading[] {
  return CATALOG.flatMap((reader) => reader(node));
}

/**
 * Reads a component from a bare expression (the `export default <expr>` form:
 * an arrow, anonymous function, or HOC call). Falls back to the inner
 * function's own name when present.
 */
export function readExpressionComponent(expr: SgNode): ShapeReading | null {
  const target = unwrapToFunction(expr);
  if (!target) return null;
  const name = target.fnNode.field('name');
  return {
    name: name ? name.text() : null,
    symbolType: symbolTypeOf(target.fnNode),
    fnNode: target.fnNode,
    wrappers: target.wrappers,
  };
}
