import type { SgNode } from '@ast-grep/napi';
import type { SymbolType } from './outline.types.js';

/**
 * A component declaration recognized by the catalog. `fnNode` is the
 * function-ish node (function_declaration / arrow_function) whose params and
 * body get read uniformly downstream.
 */
export interface ShapeReading {
  name: string | null;
  symbolType: SymbolType;
  fnNode: SgNode;
}

/**
 * Reads zero or more component shapes from one (export-unwrapped) declaration
 * node. Coverage grows by adding readers here — not by branching the walker.
 */
export type ComponentReader = (node: SgNode) => ShapeReading[];

const readFunctionDeclaration: ComponentReader = (node) => {
  if (node.kind() !== 'function_declaration') return [];
  const name = node.field('name');
  return [
    {
      name: name ? name.text() : null,
      symbolType: 'function-component',
      fnNode: node,
    },
  ];
};

const readArrowVariable: ComponentReader = (node) => {
  if (node.kind() !== 'lexical_declaration' && node.kind() !== 'variable_declaration') {
    return [];
  }
  const out: ShapeReading[] = [];
  for (const declarator of node.children()) {
    if (declarator.kind() !== 'variable_declarator') continue;
    const value = declarator.field('value');
    if (!value || value.kind() !== 'arrow_function') continue;
    const name = declarator.field('name');
    out.push({
      name: name ? name.text() : null,
      symbolType: 'arrow-component',
      fnNode: value,
    });
  }
  return out;
};

export const CATALOG: ComponentReader[] = [
  readFunctionDeclaration,
  readArrowVariable,
];

export function runCatalog(node: SgNode): ShapeReading[] {
  return CATALOG.flatMap((reader) => reader(node));
}
