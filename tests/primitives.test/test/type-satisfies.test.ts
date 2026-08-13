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
    const [matched, generics] = Type.match(Type.tag(Type.imported('Box', 'app', [Type.generic('T')]), 'primary'),
      Type.tag(Type.imported('Box', 'app', [A]), 'primary'));
    expect(matched).toBe(true);
    expect(generics!.get('T')!).toBe(A);
  });

  test('an untagged pattern does not match a tagged subject', () => {
    expect(
      Type.match(Type.imported('Box', 'app', [Type.generic('T')]),
        Type.tag(Type.imported('Box', 'app', [A]), 'primary'))[0],
    ).toBe(false);
  });

  test('a tag survives the token round trip', () => {
    const tagged = Type.tag(Type.imported('Box', 'app', [A]), 'primary');
    expect(Type.stringify(tagged)).toBe('app:Box<app:A>#primary');
    expect(satisfies(Type.from(Type.stringify(tagged)), tagged)).toBe(true);
  });
});
