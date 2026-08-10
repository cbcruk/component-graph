import { parse, Lang } from '@ast-grep/napi';
import { describe, expect, it } from 'vitest';
import { extract } from 'component-outline';
import { calleeName, findRootJsx, isHookIdentifier } from 'component-outline/ast';
import { locateComponentFn } from '../src/ast-utils.js';

/**
 * `findRootJsx` defines what counts as a component's JSX, and both layers ask
 * that question: B to decide whether to catalogue a component at all, A to
 * decide what it may edit. They used to hold separate copies, so widening one
 * would leave the other on the old definition — surfacing as
 * `component-has-no-jsx` on a file the outline describes happily.
 *
 * These pin the agreement rather than the implementation: whatever the shared
 * definition becomes, the two layers must still reach the same verdict.
 */
const CASES: Array<[name: string, code: string, hasJsx: boolean]> = [
  ['expression body', 'export const T = () => <div />;\n', true],
  ['block body with return', 'export function T() {\n  return <div />;\n}\n', true],
  [
    'parenthesised return',
    'export function T() {\n  return (\n    <div />\n  );\n}\n',
    true,
  ],
  ['no jsx at all', 'export function T() {\n  return null;\n}\n', false],
  [
    'jsx only inside a nested function',
    'export function T() {\n  const r = () => <div />;\n  return null;\n}\n',
    false,
  ],
];

describe('the two layers agree on what a component’s JSX is', () => {
  for (const [label, code, hasJsx] of CASES) {
    it(label, () => {
      // A's view: the shared walker, over the node the edit ops locate.
      const fn = locateComponentFn(parse(Lang.Tsx, code).root(), 'T');
      const aSeesJsx = fn !== null && findRootJsx(fn) !== null;

      // B's view: a component is catalogued only when it has root JSX.
      const bCatalogued = extract('t.tsx', code).components.some((c) => c.name === 'T');

      expect(aSeesJsx, `A layer, ${label}`).toBe(hasJsx);
      expect(bCatalogued, `B layer, ${label}`).toBe(hasJsx);
      expect(aSeesJsx).toBe(bCatalogued);
    });
  }
});

describe('calleeName', () => {
  const callee = (code: string) => {
    const root = parse(Lang.Tsx, code).root();
    let found: ReturnType<typeof root.field> = null;
    const visit = (n: typeof root): void => {
      if (String(n.kind()) === 'call_expression' && !found) found = n.field('function');
      n.children().forEach(visit);
    };
    visit(root);
    return calleeName(found);
  };

  it('resolves a bare identifier callee', () => {
    expect(callee('const x = useState(0);\n')).toBe('useState');
  });

  it('resolves a member-expression callee to its property', () => {
    expect(callee('const x = React.useState(0);\n')).toBe('useState');
  });

  it('returns null for a callee that is neither', () => {
    expect(callee('const x = (a || b)();\n')).toBeNull();
  });
});

describe('isHookIdentifier', () => {
  it.each([
    ['use', true],
    ['useState', true],
    ['useMyHook', true],
    ['user', false],
    ['getState', false],
  ])('%s -> %s', (name, expected) => {
    expect(isHookIdentifier(name)).toBe(expected);
  });
});
