import { describe, expect, it } from 'vitest';
import { extract } from '../src/extract.js';
import {
  CATALOG,
  DEFAULT_HOC_NAMES,
  createComponentReaders,
  type ComponentReader,
} from '../src/catalog.js';
import { kindOf } from '../src/ast.js';

const names = (code: string, readers?: readonly ComponentReader[]) =>
  extract('t.tsx', code, readers ? { readers } : {}).components.map((c) => c.name);

describe('the catalog is a seam, not a hardcoded registry', () => {
  const observed = 'export const Panel = observer(function Panel() {\n  return <div />;\n});\n';

  it('does not recognise an unknown higher-order component by default', () => {
    expect(names(observed)).toEqual([]);
  });

  // The opt-in coverage path: widen the catalog, do not edit it in place.
  it('recognises it when the reader set is built with a wider HOC list', () => {
    const readers = createComponentReaders(new Set([...DEFAULT_HOC_NAMES, 'observer']));
    expect(names(observed, readers)).toEqual(['Panel']);
  });

  it('carries the opted-in wrapper through to the outline', () => {
    const readers = createComponentReaders(new Set([...DEFAULT_HOC_NAMES, 'observer']));
    const outline = extract('t.tsx', observed, { readers });
    expect(outline.components[0]?.wrappers).toEqual(['observer']);
  });

  it('still recognises the built-in wrappers with a widened set', () => {
    const readers = createComponentReaders(new Set([...DEFAULT_HOC_NAMES, 'observer']));
    const code = 'export const M = memo(function M() {\n  return <div />;\n});\n';
    expect(names(code, readers)).toEqual(['M']);
  });

  it('honours a fully custom reader', () => {
    const onlyFoo: ComponentReader = {
      position: 'declaration',
      read: (node) =>
        kindOf(node) === 'function_declaration' && node.field('name')?.text() === 'Foo'
          ? [{ name: 'Foo', symbolType: 'function-component', fnNode: node, wrappers: [] }]
          : [],
    };
    const code =
      'export function Foo() {\n  return <div />;\n}\n' +
      'export function Bar() {\n  return <div />;\n}\n';
    expect(names(code)).toEqual(['Foo', 'Bar']);
    expect(names(code, [onlyFoo])).toEqual(['Foo']);
  });

  it('defaults to CATALOG when no readers are given', () => {
    const code = 'export function A() {\n  return <div />;\n}\n';
    expect(names(code)).toEqual(names(code, CATALOG));
  });
});

describe('reader position', () => {
  it('does not run a declaration reader against an export-default expression', () => {
    const seen: string[] = [];
    const spy: ComponentReader = {
      position: 'declaration',
      read: (node) => {
        seen.push(kindOf(node));
        return [];
      },
    };
    extract('t.tsx', 'export default () => <div />;\n', { readers: [spy] });
    expect(seen).not.toContain('arrow_function');
  });

  // Position, not node kind, is what keeps two readers off the same node:
  // `unwrapToFunction` accepts a function_declaration, so an expression reader
  // would otherwise also claim `export default function foo() {}`.
  it('reads an export-default function exactly once', () => {
    const outline = extract(
      't.tsx',
      'export default function Foo() {\n  return <div />;\n}\n',
    );
    expect(outline.components.map((c) => c.name)).toEqual(['Foo']);
  });

  it('reads an export-default arrow exactly once', () => {
    const outline = extract('t.tsx', 'export default () => <div />;\n');
    expect(outline.components).toHaveLength(1);
  });

  it('reads an export-default class exactly once', () => {
    const outline = extract(
      't.tsx',
      'export default class Foo {\n  render() {\n    return <div />;\n  }\n}\n',
    );
    expect(outline.components.map((c) => c.name)).toEqual(['Foo']);
  });
});
