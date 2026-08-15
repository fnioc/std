// Behaviour tests for Type.expand -- rewriting every union reachable from a type into the
// union-free alternatives it stands for. Ordering is leftmost-significant: the rightmost union
// varies fastest, so the alternatives below are asserted in that exact order, not just as a set.

import { type IntersectionType, Type, type UnionType } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const A = Type.imported('A', 'app');
const B = Type.imported('B', 'app');
const C = Type.imported('C', 'app');

describe('Type.expand on identifiers and literals', () => {
  test('a generic hole and a literal each expand to themselves alone', () => {
    expect(Type.expand(Type.generic('T'))).toEqual([Type.generic('T')]);
    expect(Type.expand(Type.typeLiteral(5))).toEqual([Type.typeLiteral(5)]);
  });
});

describe('Type.expand on a union', () => {
  test('flattens to its own members, in their canonical order', () => {
    const union = Type.union(C, A, B) as UnionType;
    expect(Type.expand(union)).toEqual([...union.members]);
  });
});

describe('Type.expand on generic arguments', () => {
  test('a global or imported type expands the product of its generic arguments', () => {
    const boxed = Type.global('Box', [Type.union(A, B) as UnionType]);
    expect(Type.expand(boxed)).toEqual([Type.global('Box', [A]), Type.global('Box', [B])]);
  });

  test('two open slots expand every combination, the rightmost slot varying fastest', () => {
    const pair = Type.imported('Pair', 'app', [Type.union(A, B) as UnionType, Type.union(A, C) as UnionType]);
    expect(Type.expand(pair)).toEqual([
      Type.imported('Pair', 'app', [A, A]),
      Type.imported('Pair', 'app', [A, C]),
      Type.imported('Pair', 'app', [B, A]),
      Type.imported('Pair', 'app', [B, C]),
    ]);
  });
});

describe('Type.expand on aggregates', () => {
  test('array and iterable expand their element', () => {
    const union = Type.union(A, B) as UnionType;
    expect(Type.expand(Type.array(union))).toEqual([Type.array(A), Type.array(B)]);
    expect(Type.expand(Type.iterable(union))).toEqual([Type.iterable(A), Type.iterable(B)]);
  });
});

describe('Type.expand on tuples, intersections and object types', () => {
  test('a tuple expands the product of its members', () => {
    const union = Type.union(A, B) as UnionType;
    expect(Type.expand(Type.tuple(union, C))).toEqual([Type.tuple(A, C), Type.tuple(B, C)]);
  });

  test('an intersection expands the product of its members', () => {
    const withUnion = Type.object({ b: Type.union(A, B) as UnionType });
    const fixed = Type.object({ a: A });
    const intersect = Type.intersection(fixed, withUnion) as IntersectionType;
    expect(Type.expand(intersect)).toEqual([
      Type.intersection(fixed, Type.object({ b: A })),
      Type.intersection(fixed, Type.object({ b: B })),
    ]);
  });

  test('an object expands the product of its member types, keeping the keys', () => {
    const obj = Type.object({ a: Type.union(A, B) as UnionType, b: C });
    expect(Type.expand(obj)).toEqual([Type.object({ a: A, b: C }), Type.object({ a: B, b: C })]);
  });
});

describe('Type.expand on callables', () => {
  test('a function expands the product of its parameters and return type together', () => {
    const union = Type.union(A, B) as UnionType;
    const fn = Type.func(union, [[union]]);
    expect(Type.expand(fn)).toEqual([
      Type.func(A, [[A]]),
      Type.func(B, [[A]]),
      Type.func(A, [[B]]),
      Type.func(B, [[B]]),
    ]);
  });

  test('a constructor expands each parameter row independently, alongside the instance type', () => {
    const union = Type.union(A, B) as UnionType;
    const ctor = Type.ctor({ instance: C, args: [[union], [C]], abstract: false });
    expect(Type.expand(ctor)).toEqual([
      Type.ctor({ instance: C, args: [[A], [C]], abstract: false }),
      Type.ctor({ instance: C, args: [[B], [C]], abstract: false }),
    ]);
  });
});

describe('Type.expand on a tag', () => {
  test('maps the tag over each alternative of the inner union', () => {
    const inner = Type.union(A, B) as UnionType;
    expect(Type.expand(Type.tag(inner, 'primary'))).toEqual([Type.tag(A, 'primary'), Type.tag(B, 'primary')]);
  });

  test('a union of already-tagged alternatives cannot be tagged again', () => {
    const taggedUnion = Type.union(Type.tag(A, 'x'), Type.tag(B, 'y')) as UnionType;
    const doubleTagged = Type.tag(taggedUnion, 'outer');
    expect(() => Type.expand(doubleTagged)).toThrow(TypeError);
  });
});
