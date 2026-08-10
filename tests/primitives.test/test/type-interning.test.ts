// Behaviour tests for the intern table behind `Type`. The load-bearing property is that two
// structurally identical types are the SAME object, whatever route built them -- so `===` is the
// equality operator and no separate comparison is needed.

import { type NamedType, Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const A = Type.named('A', 'app');
const B = Type.named('B', 'app');
const C = Type.named('C', 'app');

describe('one object per type', () => {
  test('a factory and a token agree, kind for kind', () => {
    expect(Type.named('Foo', 'app')).toBe(Type.from('app:Foo'));
    expect(Type.union(A, B)).toBe(Type.from('app:A | app:B'));
    expect(Type.intersection(A, B)).toBe(Type.from('app:A & app:B'));
    expect(Type.tuple(A, B)).toBe(Type.from('[app:A, app:B]'));
    expect(Type.object({ a: A })).toBe(Type.from('{ a: app:A }'));
    expect(Type.tag(A, 'primary')).toBe(Type.from('app:A#primary'));
    expect(Type.placeholder('T')).toBe(Type.from('%T'));
    expect(Type.typeLiteral(5)).toBe(Type.from('5'));
    expect(Type.func(A, B)).toBe(Type.from('(app:B) => app:A'));
    expect(Type.ctor(A, B)).toBe(Type.from('new (app:B) => app:A'));
  });

  test('the spellings of one type are one object', () => {
    expect(Type.from('Func<app:A, app:B>')).toBe(Type.from('(app:B) => app:A'));
    expect(Type.from('Ctor<app:A, app:B>')).toBe(Type.from('new (app:B) => app:A'));
    expect(Type.from('ServiceProvider')).toBe(Type.named('IServiceProvider', '@rhombus-std/primitives'));
    expect(Type.from('\\Func')).toBe(Type.named('Func'));
  });

  test('sharing reaches every subtree, not just the root', () => {
    const built = Type.named('Box', 'app', [Type.tuple(A, B)]);
    const read = Type.from('app:Box<[app:A, app:B]>') as NamedType;
    expect(read).toBe(built);
    expect(read.genericArgs[0]).toBe(Type.tuple(A, B));
  });

  test('a foreign node is adopted rather than trusted', () => {
    const forged = { kind: 'named', from: 'app', name: 'A', genericArgs: [] } as unknown as Type;
    expect(forged).not.toBe(A);
    expect(Type.tuple(forged)).toBe(Type.tuple(A));
  });
});

describe('canonical form', () => {
  test('member order does not distinguish a union or an intersection', () => {
    expect(Type.union(B, A)).toBe(Type.union(A, B));
    expect(Type.intersection(B, A)).toBe(Type.intersection(A, B));
    expect(Type.from('app:B | app:A')).toBe(Type.from('app:A | app:B'));
  });

  test('a repeated member is dropped', () => {
    expect(Type.union(A, A)).toBe(A);
    expect(Type.intersection(A, B, A)).toBe(Type.intersection(A, B));
  });

  test('a nested composite of the same kind is flattened', () => {
    expect(Type.union(A, Type.union(B, C))).toBe(Type.union(A, B, C));
    expect(Type.intersection(A, Type.intersection(B, C))).toBe(Type.intersection(A, B, C));
  });

  test('a lone member stands for itself, and none is an error', () => {
    expect(Type.union(A)).toBe(A);
    expect(Type.intersection(A)).toBe(A);
    expect(() => Type.union()).toThrow(TypeError);
    expect(() => Type.intersection()).toThrow(TypeError);
  });

  test('a literal beside its primitive base is subsumed', () => {
    expect(Type.union(Type.named('string'), Type.typeLiteral('fast'))).toBe(Type.named('string'));
    expect(Type.union(Type.named('number'), Type.typeLiteral(42))).toBe(Type.named('number'));
    expect(Type.union(Type.named('boolean'), Type.typeLiteral(true))).toBe(Type.named('boolean'));
  });

  test('nothing subsumes a nullish member, so an optional keeps its fallback', () => {
    const optional = Type.union(A, Type.typeLiteral(undefined));
    expect(optional).not.toBe(A);
    expect(Type.stringify(optional)).toBe('app:A | undefined');
  });

  test('object members are keyed in sorted order', () => {
    expect(Type.object({ b: B, a: A })).toBe(Type.object({ a: A, b: B }));
  });

  test('the canonical spelling does not depend on the order of construction', () => {
    expect(Type.stringify(Type.union(B, A))).toBe('app:A | app:B');
    expect(Type.stringify(Type.union(B, A))).toBe(Type.stringify(Type.union(A, B)));
  });
});

describe('distinctions the table keeps', () => {
  test('a literal is keyed by value and by type', () => {
    expect(Type.typeLiteral(-0)).not.toBe(Type.typeLiteral(0));
    expect(Type.typeLiteral(NaN)).toBe(Type.typeLiteral(NaN));
    expect(Type.typeLiteral(42n)).not.toBe(Type.typeLiteral(42));
    expect(Type.typeLiteral('42')).not.toBe(Type.typeLiteral(42));
  });

  test('a tag yields a type distinct from the one it wraps', () => {
    expect(Type.tag(A, 'primary')).not.toBe(A);
    expect(Type.tag(A, 'primary')).not.toBe(Type.tag(A, 'secondary'));
    expect(Type.tag(A, 'primary')).toBe(Type.from('app:A#primary'));
  });
});

describe('interned nodes are sealed', () => {
  test('a node and its members cannot be written', () => {
    const type = Type.tuple(A, B);
    expect(Object.isFrozen(type)).toBe(true);
    expect(Object.isFrozen(type.members)).toBe(true);
    expect(() => Object.assign(type, { kind: 'union' })).toThrow(TypeError);
    expect(() => (type.members as Type[]).push(C)).toThrow(TypeError);
  });
});

describe('substitution', () => {
  test('a substitution that changes nothing returns the same object', () => {
    const open = Type.named('Box', 'app', [Type.placeholder('T')]);
    expect(Type.substitute(open, new Map())).toBe(open);
    expect(Type.substitute(open, new Map([['U', A]]))).toBe(open);
  });

  test('a closed type is the one the factory would have built', () => {
    const open = Type.named('Box', 'app', [Type.placeholder('T')]);
    expect(Type.substitute(open, new Map([['T', A]]))).toBe(Type.named('Box', 'app', [A]));
  });
});

describe('equals is retired', () => {
  test('`===` is the equality operator', () => {
    // @ts-expect-error - the member is gone; two equal types are one object.
    expect(Type.equals).toBeUndefined();
  });
});
