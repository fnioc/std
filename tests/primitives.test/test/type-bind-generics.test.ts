// Behaviour tests for Type.bindGenerics — unification over interned types. Matching is identity modulo
// holes: outside a generic hole the two sides must be the same interned node, a hole binds the
// subject fragment standing in its place, and a repeated label must bind the same type each time.
// There is no assignability anywhere: no width subtyping, no literal widening to its primitive,
// no member search, no contravariant swap.

import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const A = Type.imported('A', 'app');
const B = Type.imported('B', 'app');
const C = Type.imported('C', 'app');
const T = Type.generic('T');
const U = Type.generic('U');

function matches(candidate: Type, constraint: Type): boolean {
  return Type.bindGenerics(candidate, constraint)[0];
}

/** Asserts `Type.bindGenerics` found a match and returns its bindings, narrowed off the assertion. */
function expectBindings(pattern: Type, candidate: Type): Record<string, Type> {
  const [matched, generics] = Type.bindGenerics(pattern, candidate);
  expect(matched).toBe(true);
  if (!matched) {
    throw new Error('unreachable: the assertion above already failed the test');
  }
  return generics;
}

describe('the identity stop', () => {
  test('a closed pattern matches exactly itself', () => {
    expect(matches(A, A)).toBe(true);
    expect(matches(A, B)).toBe(false);
  });

  test('interning makes the two spellings of one type the same match', () => {
    expect(Type.union(B, A)).toBe(Type.union(A, B));
    expect(matches(Type.union(B, A), Type.union(A, B))).toBe(true);
  });

  test('every kind stops on identity, composites included', () => {
    const composite = Type.func(Type.tuple(A, Type.union(B, C)), [[Type.object({ a: A })]]);
    expect(matches(composite, composite)).toBe(true);
  });
});

describe('hole binding', () => {
  test('a bare hole binds the whole subject', () => {
    const generics = expectBindings(T, A);
    expect(generics.T).toBe(A);
  });

  test('a hole inside a generic argument binds that fragment', () => {
    const generics = expectBindings(Type.imported('Box', 'app', [T]), Type.imported('Box', 'app', [A]));
    expect(generics.T).toBe(A);
  });

  test('a hole inside an aggregate element binds that element', () => {
    const generics = expectBindings(Type.array(T), Type.array(A));
    expect(generics.T).toBe(A);
  });

  test('a hole inside a tag binds only what the tag wraps', () => {
    const generics = expectBindings(Type.tag(T, 'primary'), Type.tag(A, 'primary'));
    expect(generics.T).toBe(A);
  });

  test('a bare hole binds a tagged subject whole', () => {
    const generics = expectBindings(T, Type.tag(A, 'primary'));
    expect(generics.T).toBe(Type.tag(A, 'primary'));
  });

  test('a hole in a parameter position binds the subject parameter', () => {
    const generics = expectBindings(Type.func(C, [[T]]), Type.func(C, [[A]]));
    expect(generics.T).toBe(A);
  });

  test('several holes bind independently', () => {
    const generics = expectBindings(Type.tuple(T, U), Type.tuple(A, B));
    expect(generics.T).toBe(A);
    expect(generics.U).toBe(B);
  });

  test('closing an open callable through the bindings lands on the subject itself', () => {
    const open = Type.func(Type.imported('Whatever', 'app', [T]), [[]]);
    const closed = Type.func(Type.imported('Whatever', 'app', [Type.global('string')]), [[]]);
    const generics = expectBindings(open, closed);
    expect(Type.substitute(open, generics)).toBe(closed);
  });
});

describe('a repeated label', () => {
  test('must bind the same type each time it appears', () => {
    const repeated = Type.tuple(T, T);
    expect(matches(repeated, Type.tuple(A, A))).toBe(true);
    expect(matches(repeated, Type.tuple(A, B))).toBe(false);
  });

  test('holds across positions as different as a parameter and a return type', () => {
    const pattern = Type.func(T, [[T]]);
    expect(matches(pattern, Type.func(A, [[A]]))).toBe(true);
    expect(matches(pattern, Type.func(A, [[B]]))).toBe(false);
  });
});

describe('same kind, same scalars', () => {
  test('a global matches by name; an imported by package and name', () => {
    expect(matches(Type.global('Box', [T]), Type.global('Box', [A]))).toBe(true);
    expect(matches(Type.global('Box', [T]), Type.global('Other', [A]))).toBe(false);
    expect(matches(Type.imported('Box', 'app', [T]), Type.imported('Box', 'other', [A]))).toBe(false);
  });

  test('a tag matches only the same tag; an untagged pattern never matches a tagged subject', () => {
    expect(matches(Type.tag(T, 'primary'), Type.tag(A, 'secondary'))).toBe(false);
    expect(matches(Type.imported('Box', 'app', [T]), Type.tag(Type.imported('Box', 'app', [A]), 'primary'))).toBe(false);
  });

  test('an abstract constructor pattern matches only an abstract subject, and the reverse', () => {
    expect(matches(Type.abstractCtor(T, [[]]), Type.abstractCtor(A, [[]]))).toBe(true);
    expect(matches(Type.abstractCtor(T, [[]]), Type.ctor(A, [[]]))).toBe(false);
    expect(matches(Type.ctor(T, [[]]), Type.abstractCtor(A, [[]]))).toBe(false);
  });

  test('a literal matches by exact value identity', () => {
    expect(matches(Type.typeLiteral(NaN), Type.typeLiteral(NaN))).toBe(true);
    expect(matches(Type.typeLiteral(0), Type.typeLiteral(-0))).toBe(false);
  });

  test('an array never matches an iterable, or the reverse', () => {
    expect(matches(Type.array(T), Type.iterable(A))).toBe(false);
    expect(matches(Type.iterable(T), Type.array(A))).toBe(false);
  });
});

describe('children pairwise', () => {
  test('tuples take the same length, position by position', () => {
    expect(matches(Type.tuple(T, B), Type.tuple(A, B))).toBe(true);
    expect(matches(Type.tuple(T, B), Type.tuple(B, A))).toBe(false);
    expect(matches(Type.tuple(T), Type.tuple(A, B))).toBe(false);
  });

  test('union members pair off in canonical order, same count required', () => {
    const generics = expectBindings(Type.union(T, B), Type.union(A, B));
    expect(generics.T).toBe(A);
    expect(matches(Type.union(T, B), Type.union(A, B, C))).toBe(false);
  });

  test('intersections the same way', () => {
    const left = Type.object({ a: A });
    const right = Type.object({ b: B });
    expect(matches(Type.intersection(T, right), Type.intersection(left, right))).toBe(true);
    expect(matches(Type.intersection(left, right), Type.intersection(left, Type.object({ c: C })))).toBe(false);
  });

  test('objects take exactly the same member names', () => {
    expect(matches(Type.object({ a: T }), Type.object({ a: A }))).toBe(true);
    expect(matches(Type.object({ a: T }), Type.object({ b: A }))).toBe(false);
  });

  test('signatures pair off: same signature count, signature i against signature i, same arity', () => {
    expect(matches(Type.func(C, [[T, B], [T]]), Type.func(C, [[A, B], [A]]))).toBe(true);
    expect(matches(Type.func(C, [[T, B], [T]]), Type.func(C, [[A], [A, B]]))).toBe(false);
    expect(matches(Type.func(C, [[T]]), Type.func(C, [[A, B]]))).toBe(false);
  });
});

describe('the assignability rules are gone', () => {
  test('no signature search: an overloaded subject does not answer a one-signature pattern', () => {
    expect(matches(Type.func(C, [[A]]), Type.func(C, [[A, B], [A]]))).toBe(false);
  });

  test('no width subtyping: a subject object with extra members does not match', () => {
    expect(matches(Type.object({ a: A }), Type.object({ a: A, b: B }))).toBe(false);
  });

  test('no literal widening: a string pattern does not match a string literal', () => {
    expect(matches(Type.global('string'), Type.typeLiteral('fast'))).toBe(false);
    expect(matches(Type.typeLiteral('fast'), Type.global('string'))).toBe(false);
  });

  test('no member search: a lone member does not match a union, nor a union its member', () => {
    expect(matches(A, Type.union(A, B))).toBe(false);
    expect(matches(Type.union(A, B), A)).toBe(false);
  });

  test('no covariance in an aggregate element', () => {
    expect(matches(Type.array(A), Type.array(Type.union(A, B)))).toBe(false);
  });

  test('an intersection member does not stand for the whole', () => {
    const both = Type.intersection(Type.object({ a: A }), Type.object({ b: B }));
    expect(matches(Type.object({ a: A }), both)).toBe(false);
    expect(matches(both, Type.object({ a: A }))).toBe(false);
  });
});

describe('guard against an open constraint', () => {
  test('Type.bindGenerics refuses a constraint that itself holds a generic hole', () => {
    expect(() => Type.bindGenerics(A, T)).toThrow(/constraint type may not contain generic holes/);
  });
});
