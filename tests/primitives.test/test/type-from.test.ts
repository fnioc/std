// Behaviour tests for Type.from -- the reader for type tokens. The load-bearing property is the
// round trip: every Type spells to a token that reads back into the same Type, however deeply
// nested, and whatever grammar characters its names and literal values happen to contain.

import { Type, TypeParseError } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const A = Type.named('A', 'app');
const B = Type.named('B', 'app');
const C = Type.named('C', 'app');

describe('Type.from', () => {
  test('reads a qualified name', () => {
    expect(Type.equals(Type.from('app:Foo'), Type.named('Foo', 'app'))).toBe(true);
  });

  test('an absent qualifier means the global namespace', () => {
    expect(Type.from('Foo')).toMatchObject({ kind: 'named', from: 'global', name: 'Foo' });
  });

  test('a value-type name is an ordinary named type', () => {
    expect(Type.equals(Type.from('string'), Type.named('string'))).toBe(true);
    expect(Type.equals(Type.from('global:string'), Type.named('string', 'global'))).toBe(true);
    expect(Type.equals(Type.from('number'), Type.from('global:number'))).toBe(true);
  });

  test('reads nested generics', () => {
    const nested = Type.named('Box', 'app', [Type.named('Iterable', 'global', [A])]);
    expect(Type.equals(Type.from('app:Box<Iterable<app:A>>'), nested)).toBe(true);
  });

  test('reads an object type', () => {
    expect(Type.equals(
      Type.from('{ a: string; b: app:B }'),
      Type.object({ a: Type.named('string'), b: B }),
    )).toBe(true);
  });

  test('reads a union, with intersection binding tighter', () => {
    expect(Type.equals(Type.from('app:A | app:B & app:C'), Type.union(A, Type.intersection(B, C)))).toBe(true);
    expect(Type.equals(Type.from('(app:A | app:B) & app:C'), Type.intersection(Type.union(A, B), C))).toBe(true);
  });

  test('reads a tag', () => {
    expect(Type.equals(Type.from('app:A#primary'), Type.tag(A, 'primary'))).toBe(true);
    expect(Type.equals(Type.from('(app:A | app:B)#primary'), Type.tag(Type.union(A, B), 'primary'))).toBe(true);
  });

  test('reads tuples, placeholders and literals', () => {
    expect(Type.equals(Type.from('[app:A, 5]'), Type.tuple(A, Type.typeLiteral(5)))).toBe(true);
    expect(Type.equals(Type.from('[]'), Type.tuple())).toBe(true);
    expect(Type.equals(Type.from('%T'), Type.placeholder('T'))).toBe(true);
    expect(Type.equals(Type.from('42n'), Type.typeLiteral(42n))).toBe(true);
    expect(Type.equals(Type.from('-Infinity'), Type.typeLiteral(-Infinity))).toBe(true);
    expect(Type.equals(Type.from('undefined'), Type.typeLiteral(undefined))).toBe(true);
  });

  test('reads the arrow forms', () => {
    expect(Type.equals(Type.from('(app:B) => app:A'), Type.func(A, B))).toBe(true);
    expect(Type.equals(Type.from('new (app:B) => app:A'), Type.ctor(A, B))).toBe(true);
    expect(Type.equals(Type.from('() => app:A | app:B'), Type.func(Type.union(A, B)))).toBe(true);
    expect(Type.equals(Type.from('(() => app:A) | app:B'), Type.union(Type.func(A), B))).toBe(true);
  });

  test('memoizes by token', () => {
    expect(Type.from('app:Foo')).toBe(Type.from('app:Foo'));
  });
});

describe('reserved names', () => {
  test('Func, Ctor and ServiceProvider name their own kinds', () => {
    expect(Type.equals(Type.from('Func<app:A, app:B>'), Type.func(A, B))).toBe(true);
    expect(Type.equals(Type.from('Ctor<app:A, app:B>'), Type.ctor(A, B))).toBe(true);
    expect(Type.from('ServiceProvider')).toMatchObject({
      kind: 'named',
      from: '@rhombus-std/primitives',
      name: 'IServiceProvider',
    });
  });

  test('a qualified reserved name is an ordinary named type', () => {
    expect(Type.equals(Type.from('app:Func'), Type.named('Func', 'app'))).toBe(true);
    expect(Type.equals(Type.from('app:Ctor'), Type.named('Ctor', 'app'))).toBe(true);
    expect(Type.equals(Type.from('app:ServiceProvider'), Type.named('ServiceProvider', 'app'))).toBe(true);
  });

  test('an escaped reserved name is an ordinary named type', () => {
    expect(Type.equals(Type.from('\\Func'), Type.named('Func'))).toBe(true);
    expect(Type.equals(Type.from('\\true'), Type.named('true'))).toBe(true);
  });
});

describe('escaping', () => {
  test('an ordinary spelling is unescaped', () => {
    const plain: [Type, string][] = [
      [Type.named('Foo', 'app'), 'app:Foo'],
      [Type.named('string'), 'string'],
      [Type.named('IServiceProvider', '@rhombus-std/primitives'), '@rhombus-std/primitives:IServiceProvider'],
      [Type.named('Box', 'app', [Type.named('Foo', 'app')]), 'app:Box<app:Foo>'],
      [Type.object({ a: Type.named('string') }), '{ a: string }'],
      [Type.placeholder('T'), '%T'],
      [Type.tag(A, 'primary'), 'app:A#primary'],
      [Type.func(A, B), '(app:B) => app:A'],
      [Type.ctor(A, B), 'new (app:B) => app:A'],
      [Type.tuple(A, Type.typeLiteral(5)), '[app:A, 5]'],
      [Type.union(A, B), 'app:A | app:B'],
    ];
    for (const [type, token] of plain) {
      expect(Type.stringify(type)).toBe(token);
    }
  });

  test('a literal value carrying grammar characters survives', () => {
    const value = 'a | b & c => d, "quoted" <and> \\escaped\\';
    const token = Type.stringify(Type.typeLiteral(value));
    expect(Type.from(token)).toMatchObject({ kind: 'literal', value });
  });

  test('a name carrying grammar characters survives', () => {
    const named = Type.named('has space<and>:colon', 'a|b', [A]);
    expect(Type.equals(Type.from(Type.stringify(named)), named)).toBe(true);
  });

  test('a name spelled like a keyword survives', () => {
    for (const name of ['true', 'false', 'null', 'undefined', 'NaN', 'Infinity', 'Func', 'Ctor', '1st', '']) {
      const named = Type.named(name);
      expect(Type.equals(Type.from(Type.stringify(named)), named)).toBe(true);
    }
  });

  test('a tag, placeholder label and object key carrying grammar characters survive', () => {
    const awkward = Type.object({ 'key: with; grammar': Type.tag(Type.placeholder('%odd|label'), 'a#tag') });
    expect(Type.equals(Type.from(Type.stringify(awkward)), awkward)).toBe(true);
  });
});

describe('malformed tokens', () => {
  const malformed: [string, number][] = [
    ['', 0],
    ['app:', 4],
    ['Foo<', 4],
    ['Foo<>', 4],
    ['Foo>', 3],
    ['(app:A) =>', 10],
    ['app:A | ', 8],
    ['{ a }', 4],
    ['"unterminated', 13],
    ['Func', 0],
    ['true<app:A>', 4],
  ];

  test('each throws a TypeParseError naming its position and expectation', () => {
    for (const [token, position] of malformed) {
      expect(() => Type.from(token)).toThrow(TypeParseError);
      try {
        Type.from(token);
      } catch (error) {
        expect(error).toBeInstanceOf(TypeParseError);
        expect((error as TypeParseError).position).toBe(position);
        expect((error as TypeParseError).expectation).toBeTruthy();
        expect((error as TypeParseError).message).toContain(`position ${position}`);
      }
    }
  });
});

describe('round trip', () => {
  test('every generated type reads back from its own spelling', () => {
    for (let seed = 1; seed <= 2000; seed++) {
      const original = generate(makeRandom(seed), 4);
      const token = Type.stringify(original);
      let reread: Type;
      try {
        reread = Type.from(token);
      } catch (error) {
        throw new Error(`seed ${seed} spelled ${token} which did not read back: ${(error as Error).message}`);
      }
      if (!Type.equals(original, reread)) {
        throw new Error(`seed ${seed} spelled ${token} which read back as ${Type.stringify(reread)}`);
      }
    }
  });
});

const NAMES = [
  'Foo',
  'Bar',
  'string',
  'Func',
  'Ctor',
  'ServiceProvider',
  'true',
  'NaN',
  'new',
  'A<B>',
  'a:b',
  'has space',
  '#tag',
  '%pct',
  '1st',
  '',
  'back\\slash',
  '"quoted"',
  'a|b',
  '(paren)',
  '=>arrow',
  '.dot',
];
const FROMS = ['global', 'app', '@rhombus-std/di2.core', 'a:b', 'with space', '', 'pkg-name'];
const LITERALS = [
  'fast',
  '',
  'has "quotes" and \\ backslash',
  'a | b & c => d',
  0,
  -0,
  1.5,
  NaN,
  Infinity,
  -Infinity,
  1e21,
  42n,
  -7n,
  true,
  null,
  undefined,
];

/**
 * A deterministic Type of at most `depth` levels, spanning every kind. Unions and intersections
 * always get at least two members: a one-member union spells as its lone member, which is what it
 * means, so it is not a round-trip candidate.
 */
function generate(random: () => number, depth: number): Type {
  const pick = <T>(choices: readonly T[]): T => choices[Math.floor(random() * choices.length)]!;
  const many = (most: number) => Math.floor(random() * (most + 1));
  if (depth <= 0) {
    switch (pick(['named', 'literal', 'placeholder', 'tuple', 'object'])) {
      case 'literal': {
        return Type.typeLiteral(pick(LITERALS));
      }
      case 'placeholder': {
        return Type.placeholder(pick(NAMES));
      }
      case 'tuple': {
        return Type.tuple();
      }
      case 'object': {
        return Type.object({});
      }
      default: {
        return Type.named(pick(NAMES), pick(FROMS));
      }
    }
  }
  const child = () => generate(random, depth - 1);
  const children = (most: number) => Array.from({ length: many(most) }, child);
  const kinds = ['union', 'intersection', 'tuple', 'function', 'ctor', 'named', 'object', 'literal', 'placeholder',
    'tag'];
  switch (pick(kinds)) {
    case 'union': {
      return Type.union(...Array.from({ length: 2 + many(2) }, child));
    }
    case 'intersection': {
      return Type.intersection(...Array.from({ length: 2 + many(2) }, child));
    }
    case 'tuple': {
      return Type.tuple(...children(3));
    }
    case 'function': {
      return Type.func(child(), ...children(2));
    }
    case 'ctor': {
      return Type.ctor(child(), ...children(2));
    }
    case 'object': {
      return Type.object(Object.fromEntries(Array.from({ length: many(3) }, () => [pick(NAMES), child()])));
    }
    case 'literal': {
      return Type.typeLiteral(pick(LITERALS));
    }
    case 'placeholder': {
      return Type.placeholder(pick(NAMES));
    }
    case 'tag': {
      return Type.tag(child(), pick(NAMES));
    }
    default: {
      return Type.named(pick(NAMES), pick(FROMS), children(2));
    }
  }
}

/** mulberry32 -- a seeded generator, so a failing case is reproducible from its seed alone. */
function makeRandom(seed: number): () => number {
  let state = seed;
  return function random(): number {
    state = (state + 0x6D2B79F5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
