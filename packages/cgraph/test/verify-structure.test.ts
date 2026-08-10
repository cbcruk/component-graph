import { describe, expect, it } from 'vitest';
import { verifyExtractStructure } from '../src/extract-component.js';
import { verifyInlineStructure } from '../src/inline-component.js';
import type { ExtractedProp } from '../src/extract-component.types.js';

// These reasons are unreachable from a correct planner — every one of them means
// the op produced an edit that betrays its own contract. Before the structural
// checks were separated from the type gate there was no way to reach them at
// all, so the gate carrying the package's safety argument had no direct
// coverage. Here they are driven with output a wrong planner would emit.

const countProp: ExtractedProp[] = [{ name: 'count', typeText: 'number', origin: 'param' }];

describe('verifyExtractStructure', () => {
  it('accepts a correct extraction', () => {
    const output = [
      'export function Card({ count }: { count: number }) {',
      '  return <section><CountBadge count={count} /></section>;',
      '}',
      '',
      'function CountBadge({ count }: { count: number }) {',
      '  return <span>{count}</span>;',
      '}',
      '',
    ].join('\n');
    expect(verifyExtractStructure(output, 'Card', 'CountBadge', countProp)).toBeNull();
  });

  it('rejects output where the new component was never created', () => {
    const output = 'export function Card() {\n  return <section />;\n}\n';
    expect(verifyExtractStructure(output, 'Card', 'CountBadge', [])).toBe(
      'verify-missing-new-component',
    );
  });

  it('rejects a new component that does not bind an inferred prop', () => {
    const output = [
      'export function Card({ count }: { count: number }) {',
      '  return <section><CountBadge count={count} /></section>;',
      '}',
      '',
      'function CountBadge() {',
      '  return <span>x</span>;',
      '}',
      '',
    ].join('\n');
    expect(verifyExtractStructure(output, 'Card', 'CountBadge', countProp)).toBe(
      'verify-prop-mismatch',
    );
  });

  it('rejects output that lost the original component', () => {
    const output = 'function CountBadge({ count }: { count: number }) {\n  return <span>{count}</span>;\n}\n';
    expect(verifyExtractStructure(output, 'Card', 'CountBadge', countProp)).toBe(
      'verify-missing-original',
    );
  });

  it('rejects output where the original never references the new component', () => {
    const output = [
      'export function Card() {',
      '  return <section />;',
      '}',
      '',
      'function CountBadge() {',
      '  return <span>x</span>;',
      '}',
      '',
    ].join('\n');
    expect(verifyExtractStructure(output, 'Card', 'CountBadge', [])).toBe(
      'verify-usage-missing',
    );
  });
});

describe('verifyInlineStructure', () => {
  it('accepts output with the target fully folded away', () => {
    const output = 'export function Card() {\n  return <section><span>x</span></section>;\n}\n';
    expect(verifyInlineStructure(output, 'Count')).toBeNull();
  });

  it('rejects output where the target declaration survives', () => {
    const output = [
      'export function Card() {',
      '  return <section><span>x</span></section>;',
      '}',
      '',
      'function Count() {',
      '  return <span>x</span>;',
      '}',
      '',
    ].join('\n');
    expect(verifyInlineStructure(output, 'Count')).toBe('verify-target-still-present');
  });

  it('rejects output where a usage of the target survives', () => {
    const output = 'export function Card() {\n  return <section><Count /></section>;\n}\n';
    expect(verifyInlineStructure(output, 'Count')).toBe('verify-usage-still-present');
  });
});
