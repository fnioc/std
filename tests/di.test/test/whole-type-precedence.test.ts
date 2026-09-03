// Behaviour tests for what the engine synthesizes on a whole-type miss, and for the rule that a
// registration for the whole type always outranks that synthesis. Literals, tuples, iterables and
// intersections each meet the rule their own way.

import { Builder } from '@rhombus-std/di';
import { Manifest, UnsatisfiableError } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

/** Seals `manifest` into a provider with no lifetime model: the lifetime each registration names is filed, never read. */
function toProvider(manifest: Manifest<string>) {
  return Builder.withServices(() => manifest).build();
}

const A = Type.imported('A', 'app');
const B = Type.imported('B', 'app');
const FOO = Type.imported('Foo', 'app');
const STR = Type.global('string');

class Foo {}

describe('a type literal', () => {
  test('self-satisfies when nothing is registered for it', () => {
    const provider = toProvider(Manifest.empty<string>());
    expect(provider.resolve(Type.typeLiteral('prod'))).toBe('prod');
  });

  test('is answered by its own registration ahead of self-satisfaction', () => {
    const manifest = Manifest.empty<string>()
      .addValue(Type.typeLiteral('dev'), 'override');
    expect(toProvider(manifest).resolve(Type.typeLiteral('dev'))).toBe('override');
  });
});

describe('a tuple', () => {
  test('synthesizes from its members, a literal member supplying itself', () => {
    const manifest = Manifest.empty<string>()
      .add(FOO, Foo, Type.ctor(FOO, [[]]), 'singleton');
    const pair = toProvider(manifest)
      .resolve(Type.tuple(FOO, Type.typeLiteral(5))) as [Foo, number];
    expect(Array.isArray(pair)).toBe(true);
    expect(pair[0]).toBeInstanceOf(Foo);
    expect(pair[1]).toBe(5);
  });

  test('is answered by its own registration ahead of a viable synthesis', () => {
    const manifest = Manifest.empty<string>()
      .addValue(A, 'a-val')
      .addValue(B, 'b-val')
      .addValue(Type.tuple(A, B), 'pre-made');
    expect(toProvider(manifest).resolve(Type.tuple(A, B))).toBe('pre-made');
  });
});

describe('an iterable address', () => {
  test('collects each registration satisfying a union element exactly once', () => {
    const manifest = Manifest.empty<string>()
      .addValue(A, 'a-val')
      .addValue(Type.union(A, B), 'either');
    const gathered = [...toProvider(manifest).resolve(Type.iterable(Type.union(A, B)))];
    expect(gathered).toHaveLength(2);
    expect(gathered).toContain('a-val');
    expect(gathered).toContain('either');
  });

  test('registered for exactly, wins outright — never combined with per-element answers', () => {
    const manifest = Manifest.empty<string>()
      .addValue(A, 'a-val')
      .addValue(Type.iterable(A), 'exact-iter');
    expect(toProvider(manifest).resolve(Type.iterable(A))).toBe('exact-iter');
  });
});

describe('an intersection', () => {
  const BOTH = Type.intersection(Type.object({ a: STR }), Type.object({ b: STR }));

  test('is answered by a registration for the intersection itself', () => {
    const manifest = Manifest.empty<string>().addValue(BOTH, 'both');
    expect(toProvider(manifest).resolve(BOTH)).toBe('both');
  });

  test('is never assembled from registrations covering its parts', () => {
    const manifest = Manifest.empty<string>()
      .addValue(Type.object({ a: STR, b: STR }), 'both');
    expect(() => toProvider(manifest).resolve(BOTH)).toThrow(UnsatisfiableError);
  });
});
