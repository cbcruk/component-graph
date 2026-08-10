import type { SgNode } from '@ast-grep/napi';
import type { SymbolType } from './outline.types.js';
import { calleeName, kindOf, unwrapParen } from './ast.js';

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
 * Where a reader applies. The same node *kind* can appear in both positions —
 * `unwrapToFunction` accepts a `function_declaration`, which is also what
 * `readFunctionDeclaration` reads — so position, not kind, is what keeps two
 * readers from both claiming `export default function foo() {}`.
 */
export type ReaderPosition =
  /** An export-unwrapped declaration: `function F() {}`, `const F = …`, `class F …`. */
  | 'declaration'
  /** A bare expression: the `export default <expr>` form. */
  | 'expression';

/**
 * Reads zero or more component shapes from one node. Coverage grows by adding
 * readers — not by branching the walker.
 */
export interface ComponentReader {
  position: ReaderPosition;
  read(node: SgNode): ShapeReading[];
}

/** Higher-order component callees recognized by name. */
export const DEFAULT_HOC_NAMES: ReadonlySet<string> = new Set(['memo', 'forwardRef']);

const FUNCTION_KINDS = new Set([
  'arrow_function',
  'function_expression',
  'function_declaration',
]);

function symbolTypeOf(fnNode: SgNode): SymbolType {
  return kindOf(fnNode) === 'arrow_function' ? 'arrow-component' : 'function-component';
}

function hocName(callee: SgNode | null, hocNames: ReadonlySet<string>): string | null {
  const name = calleeName(callee);
  return name && hocNames.has(name) ? name : null;
}

interface FunctionTarget {
  fnNode: SgNode;
  wrappers: string[];
}

/** Drill through `memo(...)`/`forwardRef(...)` wrappers to the inner function. */
export function unwrapToFunction(
  node: SgNode,
  hocNames: ReadonlySet<string> = DEFAULT_HOC_NAMES,
): FunctionTarget | null {
  const wrappers: string[] = [];
  let current = unwrapParen(node);

  for (;;) {
    const kind = kindOf(current);
    if (FUNCTION_KINDS.has(kind)) {
      return { fnNode: current, wrappers };
    }
    if (kind === 'call_expression') {
      const name = hocName(current.field('function'), hocNames);
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

const readFunctionDeclaration: ComponentReader = {
  position: 'declaration',
  read: (node) => {
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
  },
};

function createVariableComponentReader(hocNames: ReadonlySet<string>): ComponentReader {
  return {
    position: 'declaration',
    read: (node) => {
      const kind = kindOf(node);
      if (kind !== 'lexical_declaration' && kind !== 'variable_declaration') return [];
      const out: ShapeReading[] = [];
      for (const declarator of node.children()) {
        if (kindOf(declarator) !== 'variable_declarator') continue;
        const value = declarator.field('value');
        if (!value) continue;
        const target = unwrapToFunction(value, hocNames);
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
    },
  };
}

/**
 * A class component: `class Foo extends Component { render() { return <jsx/> } }`.
 * Recognized structurally by a `render` method — the JSX gate downstream
 * (`buildComponent` drops a reading with no root JSX) keeps false positives out.
 * `fnNode` is the render method, so params/hooks/root read uniformly. Props flow
 * through `this.props`, so its param list is honestly empty at Tier 0.
 */
function classRenderReading(node: SgNode): ShapeReading | null {
  const kind = kindOf(node);
  if (kind !== 'class_declaration' && kind !== 'class') return null;
  const body = node.field('body');
  if (!body) return null;
  const render = body
    .children()
    .find(
      (c) =>
        kindOf(c) === 'method_definition' &&
        c.field('name')?.text() === 'render',
    );
  if (!render) return null;
  const name = node.field('name');
  return {
    name: name ? name.text() : null,
    symbolType: 'class-component',
    fnNode: render,
    wrappers: [],
  };
}

const readClassComponent: ComponentReader = {
  position: 'declaration',
  read: (node) => {
    const reading = classRenderReading(node);
    return reading ? [reading] : [];
  },
};

/**
 * Reads a component from a bare expression (the `export default <expr>` form:
 * an arrow, anonymous function, class expression, or HOC call). Falls back to
 * the inner function's own name when present.
 */
function createExpressionComponentReader(
  hocNames: ReadonlySet<string>,
): ComponentReader {
  return {
    position: 'expression',
    read: (expr) => {
      const cls = classRenderReading(expr);
      if (cls) return [cls];
      const target = unwrapToFunction(expr, hocNames);
      if (!target) return [];
      const name = target.fnNode.field('name');
      return [
        {
          name: name ? name.text() : null,
          symbolType: symbolTypeOf(target.fnNode),
          fnNode: target.fnNode,
          wrappers: target.wrappers,
        },
      ];
    },
  };
}

/**
 * The standard reader set. Pass a wider `hocNames` to recognise further
 * higher-order components — the opt-in path for `styled` and friends, which
 * varies the catalog rather than editing it in place.
 */
export function createComponentReaders(
  hocNames: ReadonlySet<string> = DEFAULT_HOC_NAMES,
): ComponentReader[] {
  return [
    readFunctionDeclaration,
    createVariableComponentReader(hocNames),
    readClassComponent,
    createExpressionComponentReader(hocNames),
  ];
}

/** The default catalog: every reader, both positions, one registry. */
export const CATALOG: ComponentReader[] = createComponentReaders();

/**
 * Run the readers that apply at `position`. Filtering by position is what lets
 * one registry hold both — previously the expression reader sat outside
 * `CATALOG` and was dispatched separately, so adding a reader meant remembering
 * two places.
 */
export function runCatalog(
  node: SgNode,
  position: ReaderPosition,
  readers: readonly ComponentReader[] = CATALOG,
): ShapeReading[] {
  return readers
    .filter((reader) => reader.position === position)
    .flatMap((reader) => reader.read(node));
}
