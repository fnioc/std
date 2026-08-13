// Behaviour tests for the intern table behind `Type`. The load-bearing property is that two
// structurally identical types are the SAME object, whatever route built them -- so `===` is the
// equality operator and no separate comparison is needed.

import { type ImportType, Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const A = Type.import('A', 'app');
const B = Type.import('B', 'app');
const C = Type.import('C', 'app');

describe('one object per type', () => {
  test('a factory and a token agree, kind for kind', () => {
    expect(Type.from('app:Foo')).toBe(Type.import('Foo', 'app'));
    expect(Type.from('app:A | app:B')).toBe(Type.union(A, B));
    expect(Type.from('app:A & app:B')).toBe(Type.intersection(A, B));
    expect(Type.from('[app:A, app:B]')).toBe(Type.tuple(A, B));
    expect(Type.from('{ a: app:A }')).toBe(Type.object({ a: A }));
    expect(Type.from('app:A#primary')).toBe(Type.tag(A, 'primary'));
    expect(Type.from('%T')).toBe(Type.generic('T'));
    expect(Type.from('5')).toBe(Type.typeLiteral(5));
    expect(Type.from('(app:B) => app:A')).toBe(Type.func(A, B));
    expect(Type.from('new (app:B) => app:A')).toBe(Type.ctor(A, B));
  });

  test('the spellings of one type are one object', () => {
    expect(Type.from('Func<app:A, app:B>')).toBe(Type.from('(app:B) => app:A'));
    expect(Type.from('Ctor<app:A, app:B>')).toBe(Type.from('new (app:B) => app:A'));
    expect(Type.from('ServiceProvider')).toBe(Type.import('IServiceProvider', '@rhombus-std/primitives'));
    expect(Type.from('\\Func')).toBe(Type.global('Func'));
  });

  test('sharing reaches every subtree, not just the root', () => {
    const built = Type.import('Box', 'app', [Type.tuple(A, B)]);
    const read = Type.from('app:Box<[app:A, app:B]>') as ImportType;
    expect(read).toBe(built);
    expect(read.genericArgs[0]).toBe(Type.tuple(A, B));
  });

  test('a foreign node is adopted rather than trusted', () => {
    const forged = { kind: 'import', from: 'app', name: 'A', genericArgs: [] } as unknown as Type;
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
    expect(Type.union(Type.global('string'), Type.typeLiteral('fast'))).toBe(Type.global('string'));
    expect(Type.union(Type.global('number'), Type.typeLiteral(42))).toBe(Type.global('number'));
    expect(Type.union(Type.global('boolean'), Type.typeLiteral(true))).toBe(Type.global('boolean'));
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
    expect(Type.from('app:A#primary')).toBe(Type.tag(A, 'primary'));
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
    const open = Type.import('Box', 'app', [Type.generic('T')]);
    expect(Type.substitute(open, new Map())).toBe(open);
    expect(Type.substitute(open, new Map([['U', A]]))).toBe(open);
  });

  test('a closed type is the one the factory would have built', () => {
    const open = Type.import('Box', 'app', [Type.generic('T')]);
    expect(Type.substitute(open, new Map([['T', A]]))).toBe(Type.import('Box', 'app', [A]));
  });
});

describe('equals is retired', () => {
  test('`===` is the equality operator', () => {
    // @ts-expect-error - the member is gone; two equal types are one object.
    expect(Type.equals).toBeUndefined();
  });
});

describe('collection', () => {
  test('spells the aggregate of an element', () => {
    expect(Type.stringify(Type.iterable(A))).toBe('Iterable<app:A>');
  });

  test('the composing and the reading side land on one object', () => {
    expect(Type.iterable(A)).toBe(Type.iterable(A));
    expect(Type.from('Iterable<app:A>')).toBe(Type.iterable(A));
  });

  test('a different element is a different aggregate', () => {
    expect(Type.iterable(A)).not.toBe(Type.iterable(B));
  });

  test('nests, so an aggregate is itself collectable', () => {
    expect(Type.from('Iterable<Iterable<app:A>>')).toBe(Type.iterable(Type.iterable(A)));
  });
});

describe('array aggregate', () => {
  test('spells the aggregate of an element', () => {
    expect(Type.stringify(Type.array(A))).toBe('Array<app:A>');
  });

  test('the composing and the reading side land on one object', () => {
    expect(Type.array(A)).toBe(Type.array(A));
    expect(Type.from('Array<app:A>')).toBe(Type.array(A));
  });

  test('a different element is a different aggregate', () => {
    expect(Type.array(A)).not.toBe(Type.array(B));
  });

  test('nests, so an aggregate is itself collectable', () => {
    expect(Type.from('Array<Array<app:A>>')).toBe(Type.array(Type.array(A)));
  });

  test('a different aggregate kind over the same element is a different type', () => {
    expect(Type.array(A)).not.toBe(Type.iterable(A));
  });
});

describe('async iterable aggregate', () => {
  test('spells the aggregate of an element', () => {
    expect(Type.stringify(Type.asyncIterable(A))).toBe('AsyncIterable<app:A>');
  });

  test('the composing and the reading side land on one object', () => {
    expect(Type.asyncIterable(A)).toBe(Type.asyncIterable(A));
    expect(Type.from('AsyncIterable<app:A>')).toBe(Type.asyncIterable(A));
  });

  test('a different element is a different aggregate', () => {
    expect(Type.asyncIterable(A)).not.toBe(Type.asyncIterable(B));
  });

  test('nests, so an aggregate is itself collectable', () => {
    expect(Type.from('AsyncIterable<AsyncIterable<app:A>>')).toBe(Type.asyncIterable(Type.asyncIterable(A)));
  });

  test('a different aggregate kind over the same element is a different type', () => {
    expect(Type.asyncIterable(A)).not.toBe(Type.iterable(A));
    expect(Type.asyncIterable(A)).not.toBe(Type.array(A));
  });
});

// The `named` door is the one a derived spelling arrives through: a compile-time
// derivation emits `Type.import(name, from, [element])`, never the aggregate
// factory directly. The two must land on the same object, or a derived
// registration and a hand-written one address different types.
describe('the global door mints an aggregate from its spelling', () => {
  test('each reserved spelling carrying one argument is its own kind', () => {
    expect(Type.global('Array', [A])).toBe(Type.array(A));
    expect(Type.global('Iterable', [A])).toBe(Type.iterable(A));
    expect(Type.global('AsyncIterable', [A])).toBe(Type.asyncIterable(A));
    expect(Type.global('Async', [A])).toBe(Type.async(A));
  });

  test('a spelling carrying more than its element is an ordinary global type', () => {
    // What a derivation must never emit: the lib declares `Iterable<T, TReturn,
    // TNext>`, so an untrimmed spelling would land here instead of on the kind.
    const overwide = Type.global('AsyncIterable', [A, B, C]);
    expect(overwide.kind).toBe('global');
    expect(overwide).not.toBe(Type.asyncIterable(A));
  });

  test('an imported spelling names an ordinary type, aggregate word or not', () => {
    expect(Type.import('AsyncIterable', 'app', [A]).kind).toBe('import');
  });
});
