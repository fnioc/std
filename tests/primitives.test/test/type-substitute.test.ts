// Behaviour tests for Type.substitute -- replacing generic holes with concrete types. The load-
// bearing property beyond a matched/unmatched hole is that substitution reaches every position a
// hole can sit in, keeps a callable the same kind, and splices a replacement in as-is without
// re-scanning it for further holes.

import { type TupleType, Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const A = Type.imported('A', 'app');
const B = Type.imported('B', 'app');
const T = Type.generic('T');

describe('Type.substitute on identifiers', () => {
  test('a matched hole is replaced', () => {
    expect(Type.substitute(T, new Map([['T', A]]))).toBe(A);
  });

  test('an unmatched hole is left alone', () => {
    expect(Type.substitute(T, new Map([['U', A]]))).toBe(T);
  });

  test('global and imported generic arguments are substituted', () => {
    expect(Type.substitute(Type.global('Box', [T]), new Map([['T', A]]))).toBe(Type.global('Box', [A]));
    expect(Type.substitute(Type.imported('Box', 'app', [T]), new Map([['T', A]])))
      .toBe(Type.imported('Box', 'app', [A]));
  });
});

describe('Type.substitute on aggregates', () => {
  test('array and iterable substitute their element', () => {
    expect(Type.substitute(Type.array(T), new Map([['T', A]]))).toBe(Type.array(A));
    expect(Type.substitute(Type.iterable(T), new Map([['T', A]]))).toBe(Type.iterable(A));
  });
});

describe('Type.substitute on callables', () => {
  test('a constructor substitutes its instance and every parameter row', () => {
    const open = Type.ctor({ instance: T, args: [[T], [A, T]], abstract: false });
    const closed = Type.ctor({ instance: A, args: [[A], [A, A]], abstract: false });
    expect(Type.substitute(open, new Map([['T', A]]))).toBe(closed);
  });

  test('a function substitutes its return and every parameter row', () => {
    const open = Type.func({ return: T, args: [[T, B]] });
    expect(Type.substitute(open, new Map([['T', A]]))).toBe(Type.func({ return: A, args: [[A, B]] }));
  });

  test('the result stays the same callable kind, so a caller keeps its narrower type', () => {
    const closed = Type.substitute(Type.ctor(T, [[]]), new Map([['T', A]]));
    expect(closed.kind).toBe('ctor');
  });
});

describe('Type.substitute on composites', () => {
  test('a union or intersection substitutes every member', () => {
    expect(Type.substitute(Type.union(T, B), new Map([['T', A]]))).toBe(Type.union(A, B));
    const open = Type.intersection(Type.object({ a: T }), Type.object({ b: B }));
    const closed = Type.intersection(Type.object({ a: A }), Type.object({ b: B }));
    expect(Type.substitute(open, new Map([['T', A]]))).toBe(closed);
  });

  test('a tuple substitutes every member', () => {
    expect(Type.substitute(Type.tuple(T, B), new Map([['T', A]]))).toBe(Type.tuple(A, B));
  });

  test('an object substitutes every member value, keeping the keys', () => {
    expect(Type.substitute(Type.object({ a: T, b: B }), new Map([['T', A]]))).toBe(Type.object({ a: A, b: B }));
  });
});

describe('Type.substitute on a tag', () => {
  test('the inner type is substituted, the tag itself untouched', () => {
    expect(Type.substitute(Type.tag(T, 'primary'), new Map([['T', A]]))).toBe(Type.tag(A, 'primary'));
  });

  test('substituting a hole with an already-tagged type is refused', () => {
    const alreadyTagged = Type.tag(B, 'secondary');
    expect(() => Type.substitute(Type.tag(T, 'primary'), new Map([['T', alreadyTagged]]))).toThrow(TypeError);
  });
});

describe('Type.substitute on a literal', () => {
  test('a literal has nothing to substitute and is returned unchanged', () => {
    const literal = Type.typeLiteral('fast');
    expect(Type.substitute(literal, new Map([['T', A]]))).toBe(literal);
  });
});

describe('one pass, no re-entry', () => {
  test('a substituted type is spliced in as-is, not re-scanned for the holes it still carries', () => {
    const replacement = Type.tuple(T, A);
    const result = Type.substitute(T, new Map([['T', replacement]])) as TupleType;
    expect(result).toBe(replacement);
    expect(result.members[0]).toBe(T);
  });
});
