// Behaviour tests for Type.from -- the reader for type tokens. The load-bearing property is the
// round trip: every Type spells to a token that reads back into the same Type, however deeply
// nested, and whatever grammar characters its names and literal values happen to contain.

import { Type, TypeParseError, type UnionType } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const A = Type.imported('A', 'app');
const B = Type.imported('B', 'app');
const C = Type.imported('C', 'app');

describe('Type.from', () => {
  test('reads a qualified name', () => {
    expect(Type.from('app:Foo')).toBe(Type.imported('Foo', 'app'));
  });

  test('an absent qualifier means the global namespace', () => {
    expect(Type.from('Foo')).toMatchObject({ kind: 'global', name: 'Foo' });
  });

  test('a value-type name is an ordinary named type', () => {
    expect(Type.from('string')).toBe(Type.global('string'));
    expect(Type.from('global:string')).toBe(Type.global('string'));
    expect(Type.from('number')).toBe(Type.from('global:number'));
  });

  test('reads nested generics', () => {
    const nested = Type.imported('Box', 'app', [Type.iterable(A)]);
    expect(Type.from('app:Box<Iterable<app:A>>')).toBe(nested);
  });

  test('reads an object type', () => {
    expect(Type.from('{ a: string; b: app:B }')).toBe(Type.object({ a: Type.global('string'), b: B }));
  });

  test('reads a union, with intersection binding tighter', () => {
    expect(Type.from('app:A | app:B & app:C')).toBe(Type.union(A, Type.intersection(B, C)));
    expect(Type.from('(app:A | app:B) & app:C')).toBe(Type.intersection(Type.union(A, B), C));
  });

  test('reads a tag', () => {
    expect(Type.from('app:A#primary')).toBe(Type.tag(A, 'primary'));
    expect(Type.from('(app:A | app:B)#primary')).toBe(Type.tag(Type.union(A, B) as UnionType, 'primary'));
  });

  test('reads tuples, generic holes and literals', () => {
    expect(Type.from('[app:A, 5]')).toBe(Type.tuple(A, Type.typeLiteral(5)));
    expect(Type.from('[]')).toBe(Type.tuple());
    expect(Type.from('%T')).toBe(Type.generic('T'));
    expect(Type.from('42n')).toBe(Type.typeLiteral(42n));
    expect(Type.from('-Infinity')).toBe(Type.typeLiteral(-Infinity));
    expect(Type.from('undefined')).toBe(Type.typeLiteral(undefined));
  });

  test('reads a callable answering to several calls, semicolons between its rows', () => {
    expect(Type.from('(app:A; ) => app:B')).toBe(Type.func({ returnType: B, args: [[A], []] }));
    expect(Type.from('new (app:A; app:B, app:A) => app:B')).toBe(
      Type.ctor({ instanceType: B, args: [[A], [B, A]] }),
    );
    // A leading empty row is the call taking nothing, written first.
    expect(Type.from('(; app:A) => app:B')).toBe(Type.func({ returnType: B, args: [[], [A]] }));
    // The reserved spellings carry rows too, the head separated by its own comma.
    expect(Type.from('Func<app:B, app:A; >')).toBe(Type.from('(app:A; ) => app:B'));
    expect(Type.from('Ctor<app:B; app:A>')).toBe(Type.from('new (; app:A) => app:B'));
  });

  test('a callable with one row spells exactly as it always has', () => {
    expect(Type.stringify(Type.func(B, [[A]]))).toBe('(app:A) => app:B');
    expect(Type.stringify(Type.ctor(B, [[]]))).toBe('new () => app:B');
    expect(Type.stringify(Type.func({ returnType: B, args: [[A], []] }))).toBe('(app:A; ) => app:B');
  });

  test('reads the arrow forms', () => {
    expect(Type.from('(app:B) => app:A')).toBe(Type.func(A, [[B]]));
    expect(Type.from('new (app:B) => app:A')).toBe(Type.ctor(A, [[B]]));
    expect(Type.from('() => app:A | app:B')).toBe(Type.func(Type.union(A, B), [[]]));
    expect(Type.from('(() => app:A) | app:B')).toBe(Type.union(Type.func(A, [[]]), B));
  });

  test('whitespace is not part of what a token spells', () => {
    expect(Type.from('app:A|app:B')).toBe(Type.from('app:A | app:B'));
    expect(Type.from('\n app:A\t|  app:B ')).toBe(Type.from('app:A | app:B'));
    expect(Type.from('app:Box< app:A , app:B >')).toBe(Type.from('app:Box<app:A,app:B>'));
  });
});

describe('reserved names', () => {
  test('Func, Ctor and ServiceProvider name their own kinds', () => {
    expect(Type.from('Func<app:A, app:B>')).toBe(Type.func(A, [[B]]));
    expect(Type.from('Ctor<app:A, app:B>')).toBe(Type.ctor(A, [[B]]));
    expect(Type.from('ServiceProvider')).toMatchObject({
      kind: 'imported',
      from: '@rhombus-std/primitives',
      name: 'IServiceProvider',
    });
  });

  test('a qualified reserved name is an ordinary named type', () => {
    expect(Type.from('app:Func')).toBe(Type.imported('Func', 'app'));
    expect(Type.from('app:Ctor')).toBe(Type.imported('Ctor', 'app'));
    expect(Type.from('app:ServiceProvider')).toBe(Type.imported('ServiceProvider', 'app'));
  });

  test('an escaped reserved name is an ordinary named type', () => {
    expect(Type.from('\\Func')).toBe(Type.global('Func'));
    expect(Type.from('\\true')).toBe(Type.global('true'));
  });
});

describe('escaping', () => {
  test('an ordinary spelling is unescaped', () => {
    const plain: [Type, string][] = [
      [Type.imported('Foo', 'app'), 'app:Foo'],
      [Type.global('string'), 'string'],
      [Type.imported('IServiceProvider', '@rhombus-std/primitives'), '@rhombus-std/primitives:IServiceProvider'],
      [Type.imported('Box', 'app', [Type.imported('Foo', 'app')]), 'app:Box<app:Foo>'],
      [Type.object({ a: Type.global('string') }), '{ a: string }'],
      [Type.generic('T'), '%T'],
      [Type.tag(A, 'primary'), 'app:A#primary'],
      [Type.func(A, [[B]]), '(app:B) => app:A'],
      [Type.ctor(A, [[B]]), 'new (app:B) => app:A'],
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
    const named = Type.imported('has space<and>:colon', 'a|b', [A]);
    expect(Type.from(Type.stringify(named))).toBe(named);
  });

  test('a name spelled like a keyword survives', () => {
    for (const name of ['true', 'false', 'null', 'undefined', 'NaN', 'Infinity', 'Func', 'Ctor', '1st', '']) {
      const named = Type.global(name);
      expect(Type.from(Type.stringify(named))).toBe(named);
    }
  });

  test('a tag, generic hole label and object key carrying grammar characters survive', () => {
    const awkward = Type.object({ 'key: with; grammar': Type.tag(Type.generic('%odd|label'), 'a#tag') });
    expect(Type.from(Type.stringify(awkward))).toBe(awkward);
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
      if (reread !== original) {
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
const FROMS = ['app', '@rhombus-std/di.core', 'a:b', 'with space', '', 'pkg-name'];
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
    switch (pick(['global', 'imported', 'literal', 'generic', 'tuple', 'object'])) {
      case 'literal': {
        return Type.typeLiteral(pick(LITERALS));
      }
      case 'generic': {
        return Type.generic(pick(NAMES));
      }
      case 'tuple': {
        return Type.tuple();
      }
      case 'object': {
        return Type.object({});
      }
      case 'global': {
        return Type.global(pick(NAMES));
      }
      default: {
        return Type.imported(pick(NAMES), pick(FROMS));
      }
    }
  }
  const child = () => generate(random, depth - 1);
  const children = (most: number) => Array.from({ length: many(most) }, child);
  // At least one row, since a callable answers to at least one call.
  const rows = () => Array.from({ length: 1 + many(2) }, () => children(2));
  const kinds = ['union', 'intersection', 'tuple', 'func', 'ctor', 'global', 'imported', 'object', 'literal', 'generic',
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
    case 'func': {
      return Type.func({ returnType: child(), args: rows() });
    }
    case 'ctor': {
      return Type.ctor({ instanceType: child(), args: rows() });
    }
    case 'object': {
      return Type.object(Object.fromEntries(Array.from({ length: many(3) }, () => [pick(NAMES), child()])));
    }
    case 'literal': {
      return Type.typeLiteral(pick(LITERALS));
    }
    case 'generic': {
      return Type.generic(pick(NAMES));
    }
    case 'tag': {
      // A tagged type is spellable only under a tag-free one, so a tagged pick contributes its own inner type.
      const inner = child();
      return Type.tag(inner.kind === 'tag' ? inner.type : inner, pick(NAMES));
    }
    case 'global': {
      return Type.global(pick(NAMES), children(2));
    }
    default: {
      return Type.imported(pick(NAMES), pick(FROMS), children(2));
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
