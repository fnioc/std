// Behaviour tests for the parenthesization Type.stringify applies so nesting survives the round
// trip through Type.from. type-from.test.ts already covers the arrow, union/intersection binding
// and escaping cases; this file targets the precedence combinations that suite doesn't build --
// composites nested under a tag, and an arrow chained through its own return position.

import { type IntersectionType, Type, type UnionType } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const A = Type.imported('A', 'app');
const B = Type.imported('B', 'app');
const C = Type.imported('C', 'app');

describe('Type.stringify precedence', () => {
  test('a union nested inside an intersection member is parenthesized', () => {
    const type = Type.intersection(Type.union(A, B) as UnionType, C);
    expect(Type.stringify(type)).toBe('(app:A | app:B) & app:C');
  });

  test('an intersection nested under a tag is parenthesized', () => {
    const type = Type.tag(Type.intersection(A, B) as IntersectionType, 'primary');
    expect(Type.stringify(type)).toBe('(app:A & app:B)#primary');
  });

  test('a tag over one union member needs no parentheses beyond the tag itself', () => {
    const type = Type.union(Type.tag(A, 'x'), B);
    expect(Type.stringify(type)).toBe('app:A#x | app:B');
  });

  test('an arrow chained through its own return position needs no extra parentheses', () => {
    const inner = Type.func(C, [[B]]);
    const outer = Type.func(inner, [[A]]);
    expect(Type.stringify(outer)).toBe('(app:A) => (app:B) => app:C');
  });

  test('an object member type at arrow precedence needs no parentheses for a nested arrow', () => {
    const type = Type.object({ f: Type.func(A, [[B]]) });
    expect(Type.stringify(type)).toBe('{ f: (app:B) => app:A }');
  });
});
