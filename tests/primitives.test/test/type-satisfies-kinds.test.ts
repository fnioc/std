// Behaviour tests for Type.satisfies / Type.match across the node kinds the tag-focused suite
// (type-satisfies.test.ts) doesn't reach: aggregates, globals, imports, composites, objects,
// tuples, literals, and the capture bookkeeping a union condition or a contravariant parameter
// position relies on.

import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const A = Type.imported('A', 'app');
const B = Type.imported('B', 'app');
const C = Type.imported('C', 'app');

function satisfies(proposed: Type, condition: Type): boolean {
  return Type.satisfies(proposed, condition)[0];
}

describe('Type.satisfies on aggregates', () => {
  test('one aggregate satisfies another of its own kind covariantly in the element', () => {
    expect(satisfies(Type.array(A), Type.array(Type.union(A, B)))).toBe(true);
    expect(satisfies(Type.array(A), Type.array(B))).toBe(false);
  });

  test('an array does not satisfy an iterable condition, or the reverse', () => {
    expect(satisfies(Type.array(A), Type.iterable(A))).toBe(false);
    expect(satisfies(Type.iterable(A), Type.array(A))).toBe(false);
  });
});

describe('Type.satisfies on global types', () => {
  test('a literal satisfies the global name of its own primitive base', () => {
    expect(satisfies(Type.typeLiteral('fast'), Type.global('string'))).toBe(true);
    expect(satisfies(Type.typeLiteral(42), Type.global('string'))).toBe(false);
  });

  test('two global types match by name and generic arguments together', () => {
    expect(satisfies(Type.global('Box', [A]), Type.global('Box', [A]))).toBe(true);
    expect(satisfies(Type.global('Box', [A]), Type.global('Box', [B]))).toBe(false);
    expect(satisfies(Type.global('Box', [A]), Type.global('Other', [A]))).toBe(false);
  });
});

describe('Type.satisfies on imported types', () => {
  test('matches by package, name and generic arguments together', () => {
    expect(satisfies(Type.imported('Box', 'app', [A]), Type.imported('Box', 'app', [A]))).toBe(true);
    expect(satisfies(Type.imported('Box', 'app', [A]), Type.imported('Box', 'other', [A]))).toBe(false);
    expect(satisfies(Type.imported('Box', 'app', [A]), Type.imported('Box', 'app', [B]))).toBe(false);
  });
});

describe('Type.satisfies on intersections', () => {
  test('a condition intersection needs every member satisfied', () => {
    const condition = Type.intersection(Type.object({ a: A }), Type.object({ b: B }));
    expect(satisfies(Type.object({ a: A, b: B }), condition)).toBe(true);
    expect(satisfies(Type.object({ a: A }), condition)).toBe(false);
  });

  test('a proposed intersection satisfies a non-intersection condition through any one member', () => {
    const proposed = Type.intersection(Type.object({ a: A }), Type.object({ b: B }));
    expect(satisfies(proposed, Type.object({ a: A }))).toBe(true);
    expect(satisfies(proposed, Type.object({ c: C }))).toBe(false);
  });
});

describe('Type.satisfies on unions', () => {
  test('a proposed union must satisfy every one of its branches', () => {
    expect(satisfies(Type.union(A, B), Type.union(A, B, C))).toBe(true);
    expect(satisfies(Type.union(A, B), Type.union(A, C))).toBe(false);
  });

  test('a condition union is satisfied once any one branch is', () => {
    const [satisfied, generics] = Type.satisfies(A, Type.union(Type.generic('T'), B));
    expect(satisfied).toBe(true);
    expect(generics!.get('T')).toBe(A);
  });

  test('a failed union branch does not leave a stale capture for a later branch to inherit', () => {
    // Both branches bind the same labels, so a leaked capture from the failed first branch would
    // corrupt the second: %T bound to A here would make the second branch's own T-capture (B)
    // conflict and fail, instead of the true result -- satisfied via a clean second attempt.
    const failsOnSecondPosition = Type.tuple(Type.generic('T'), Type.generic('T'));
    const succeedsOnceClean = Type.tuple(Type.generic('U'), Type.generic('T'));
    const [satisfied, generics] = Type.satisfies(
      Type.tuple(A, B),
      Type.union(failsOnSecondPosition, succeedsOnceClean),
    );
    expect(satisfied).toBe(true);
    expect(generics!.get('T')).toBe(B);
    expect(generics!.get('U')).toBe(A);
  });
});

describe('Type.satisfies on objects', () => {
  test('width subtyping: the proposed object may carry members the condition does not name', () => {
    expect(satisfies(Type.object({ a: A, b: B }), Type.object({ a: A }))).toBe(true);
  });

  test('a member the condition requires but the proposal lacks fails', () => {
    expect(satisfies(Type.object({ a: A }), Type.object({ a: A, b: B }))).toBe(false);
  });

  test('a present member must itself satisfy the condition member', () => {
    expect(satisfies(Type.object({ a: B }), Type.object({ a: A }))).toBe(false);
  });
});

describe('Type.satisfies on tuples', () => {
  test('a different length never satisfies', () => {
    expect(satisfies(Type.tuple(A, B), Type.tuple(A, B, C))).toBe(false);
    expect(satisfies(Type.tuple(A, B, C), Type.tuple(A, B))).toBe(false);
  });

  test('every position is matched positionally', () => {
    expect(satisfies(Type.tuple(A, B), Type.tuple(A, B))).toBe(true);
    expect(satisfies(Type.tuple(A, B), Type.tuple(B, A))).toBe(false);
  });
});

describe('Type.satisfies on literal types', () => {
  test('exact value identity, via Object.is', () => {
    expect(satisfies(Type.typeLiteral(0), Type.typeLiteral(-0))).toBe(false);
    expect(satisfies(Type.typeLiteral(NaN), Type.typeLiteral(NaN))).toBe(true);
    expect(satisfies(Type.typeLiteral('x'), Type.typeLiteral('x'))).toBe(true);
  });
});

describe('generic capture consistency', () => {
  test('a label appearing twice in a condition must capture equal types both times', () => {
    const repeated = Type.tuple(Type.generic('T'), Type.generic('T'));
    expect(satisfies(Type.tuple(A, A), repeated)).toBe(true);
    expect(satisfies(Type.tuple(A, B), repeated)).toBe(false);
  });
});

describe('Type.match', () => {
  test('a pattern hole captures the subject fragment standing in its place', () => {
    const [matched, generics] = Type.match(Type.array(Type.generic('T')), Type.array(A));
    expect(matched).toBe(true);
    expect(generics!.get('T')).toBe(A);
  });

  test('a pattern hole inside a contravariant parameter position still captures the subject argument', () => {
    const pattern = Type.func(Type.global('result'), [[Type.generic('T')]]);
    const subject = Type.func(Type.global('result'), [[A]]);
    const [matched, generics] = Type.match(pattern, subject);
    expect(matched).toBe(true);
    expect(generics!.get('T')).toBe(A);
  });

  test('a non-generic pattern behaves like an ordinary satisfies check', () => {
    expect(Type.match(A, A)[0]).toBe(true);
    expect(Type.match(A, B)[0]).toBe(false);
  });
});

describe('guard against open operands', () => {
  test('Type.satisfies refuses a proposed type that itself holds a generic hole', () => {
    expect(() => Type.satisfies(Type.generic('T'), A)).toThrow(/proposed type may not contain generic holes/);
  });

  test('Type.match refuses a subject that itself holds a generic hole', () => {
    expect(() => Type.match(A, Type.generic('T'))).toThrow(/subject type may not contain generic holes/);
  });
});
