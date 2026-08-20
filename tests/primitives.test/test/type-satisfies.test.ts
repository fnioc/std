// Behaviour tests for the tag rule in Type.satisfies / Type.match. A tag is a type of its own,
// never a refinement of the type it wraps: matching it takes the same tag on both sides, and
// nothing crosses between the tagged and untagged spellings of one type.

import { Type, type UnionType } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const A = Type.imported('A', 'app');
const B = Type.imported('B', 'app');

function satisfies(proposed: Type, condition: Type): boolean {
  return Type.satisfies(proposed, condition)[0];
}

describe('Type.satisfies on tags', () => {
  test('the same tag over the same type satisfies', () => {
    expect(satisfies(Type.tag(A, 'primary'), Type.tag(A, 'primary'))).toBe(true);
  });

  test('a different tag does not', () => {
    expect(satisfies(Type.tag(A, 'secondary'), Type.tag(A, 'primary'))).toBe(false);
  });

  test('an untagged type does not satisfy a tagged condition', () => {
    expect(satisfies(A, Type.tag(A, 'primary'))).toBe(false);
  });

  test('a tagged type does not satisfy the untagged condition it wraps', () => {
    expect(satisfies(Type.tag(A, 'primary'), A)).toBe(false);
    expect(satisfies(Type.tag(A, 'primary'), Type.union(A, B))).toBe(false);
  });

  test('under a shared tag the inner types are matched by the usual rules', () => {
    expect(satisfies(Type.tag(A, 'primary'), Type.tag(B, 'primary'))).toBe(false);
    expect(satisfies(Type.tag(A, 'primary'), Type.tag(Type.union(A, B) as UnionType, 'primary'))).toBe(true);
  });

  test('a generic hole captures a tagged type whole', () => {
    const [satisfied, generics] = Type.satisfies(Type.tag(A, 'primary'), Type.generic('T'));
    expect(satisfied).toBe(true);
    expect(generics!.get('T')!).toBe(Type.tag(A, 'primary'));
  });

  test('a generic hole inside a tag captures only what the tag wraps', () => {
    const [satisfied, generics] = Type.satisfies(Type.tag(A, 'primary'), Type.tag(Type.generic('T'), 'primary'));
    expect(satisfied).toBe(true);
    expect(generics!.get('T')!).toBe(A);
  });
});

describe('Type.match on tags', () => {
  test('an open tagged pattern closes over the request it matched', () => {
    const [matched, generics] = Type.match(Type.tag(Type.imported('Box', 'app', [Type.generic('T')]), 'primary'), Type.tag(Type.imported('Box', 'app', [A]), 'primary'));
    expect(matched).toBe(true);
    expect(generics!.get('T')!).toBe(A);
  });

  test('an untagged pattern does not match a tagged subject', () => {
    expect(
      Type.match(Type.imported('Box', 'app', [Type.generic('T')]), Type.tag(Type.imported('Box', 'app', [A]), 'primary'))[0],
    ).toBe(false);
  });

  test('a tag survives the token round trip', () => {
    const tagged = Type.tag(Type.imported('Box', 'app', [A]), 'primary');
    expect(Type.stringify(tagged)).toBe('app:Box<app:A>#primary');
    expect(satisfies(Type.from(Type.stringify(tagged)), tagged)).toBe(true);
  });
});

describe('Type.satisfies on parameter rows', () => {
  const C = Type.imported('C', 'app');

  test('an overloaded proposal serves a condition any one of its rows serves', () => {
    const overloaded = Type.func({ return: C, args: [[A, B], [A]] });
    expect(satisfies(overloaded, Type.func(C, [[A]]))).toBe(true);
    expect(satisfies(overloaded, Type.func(C, [[A, B]]))).toBe(true);
  });

  test('and refuses one no row serves', () => {
    const overloaded = Type.func({ return: C, args: [[A, B], [A]] });
    expect(satisfies(overloaded, Type.func(C, [[B]]))).toBe(false);
    expect(satisfies(overloaded, Type.func(C, [[]]))).toBe(false);
  });

  test('every condition row needs an answer — a shared call is not enough on its own', () => {
    const condition = Type.ctor({ instance: C, args: [[A], [A, B]], abstract: false });
    expect(satisfies(Type.ctor({ instance: C, args: [[A], [A, B]], abstract: false }), condition)).toBe(true);
    // Serving only the [A] row leaves [A, B] unanswered — surplus rows are fine, missing ones are not.
    expect(satisfies(Type.ctor(C, [[A]]), condition)).toBe(false);
    expect(satisfies(Type.ctor(C, [[B]]), condition)).toBe(false);
  });

  test('a row that fails leaves no capture behind for the next one to read', () => {
    const [satisfied, generics] = Type.satisfies(
      Type.func({ return: C, args: [[A], [B]] }),
      Type.func(C, [[B]]),
    );
    expect(satisfied).toBe(true);
    expect(generics!.size).toBe(0);
  });
});

describe('Type.satisfies on an abstract constructor', () => {
  const C = Type.imported('C', 'app');
  const concrete = () => Type.ctor(C, [[]]);
  const abstractCtor = () => Type.ctor(C, [[]], true);

  test('a concrete candidate serves both a concrete and an abstract request', () => {
    expect(satisfies(concrete(), concrete())).toBe(true);
    expect(satisfies(concrete(), abstractCtor())).toBe(true);
  });

  test('an abstract candidate serves only an abstract request', () => {
    expect(satisfies(abstractCtor(), abstractCtor())).toBe(true);
    expect(satisfies(abstractCtor(), concrete())).toBe(false);
  });
});

describe('a callable answers to at least one call', () => {
  test('no row at all is refused, since it has no spelling', () => {
    expect(() => Type.func({ return: A, args: [] })).toThrow(TypeError);
    expect(() => Type.ctor({ instance: A, args: [], abstract: false })).toThrow(/at least one call/);
  });

  test('one empty row is a callable taking nothing', () => {
    expect(Type.func({ return: A, args: [[]] })).toBe(Type.func(A, [[]]));
    expect(Type.stringify(Type.func(A, [[]]))).toBe('() => app:A');
  });
});
