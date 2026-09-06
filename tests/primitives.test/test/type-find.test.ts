// Behaviour tests for the search ops — which slots the walk reaches, which node wins when several
// answer — and for what a promise settles to however many layers deep.

import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const CONN = Type.imported('Conn', 'app');
const WIDGET = Type.imported('Widget', 'app');
const STRING = Type.global('string');
const NUMBER = Type.global('number');

/** Accepts every imported node, so a case reads as "which import did the walk reach first". */
const isImported = (node: Type) => node.kind === 'imported';

describe('Type.find', () => {
  test('answers the type itself when it is what the predicate accepts', () => {
    expect(Type.find(CONN, isImported)).toBe(CONN);
  });

  test('reaches a node nested several slots deep', () => {
    expect(Type.find(Type.array(Type.optional(CONN)), isImported)).toBe(CONN);
  });

  test('answers undefined when no node satisfies the predicate', () => {
    expect(Type.find(Type.array(STRING), isImported)).toBeUndefined();
  });

  test('answers the first node in pre-order, the containing type before what it holds', () => {
    const address = Type.array(CONN);

    expect(Type.find(address, node => node === address || node === CONN)).toBe(address);
  });

  test('answers the earlier slot when several satisfy the predicate', () => {
    expect(Type.find(Type.tuple(STRING, WIDGET, CONN), isImported)).toBe(WIDGET);
  });

  test('reaches a callable return type', () => {
    expect(Type.find(Type.func(CONN, [[STRING]]), isImported)).toBe(CONN);
  });

  test('reaches a callable parameter', () => {
    expect(Type.find(Type.func(STRING, [[NUMBER, CONN]]), isImported)).toBe(CONN);
  });

  test('reaches the type a key wraps', () => {
    expect(Type.find(Type.tag(CONN, 'primary'), isImported)).toBe(CONN);
  });

  test('reaches a union member', () => {
    expect(Type.find(Type.union(STRING, CONN), isImported)).toBe(CONN);
  });

  test('reaches a promise argument', () => {
    expect(Type.find(Type.promise(CONN), isImported)).toBe(CONN);
  });

  test('reaches an object member', () => {
    expect(Type.find(Type.object({ conn: CONN }), isImported)).toBe(CONN);
  });

  test('offers a node standing in several positions once', () => {
    const visited: Type[] = [];

    Type.find(Type.func(CONN, [[CONN]]), node => {
      visited.push(node);
      return false;
    });

    expect(visited.filter(node => node === CONN)).toHaveLength(1);
  });
});

describe('Type.some', () => {
  test('says yes for a node anywhere inside the type', () => {
    expect(Type.some(Type.array(Type.optional(CONN)), isImported)).toBeTrue();
  });

  test('says no when nothing inside the type satisfies the predicate', () => {
    expect(Type.some(Type.array(STRING), isImported)).toBeFalse();
  });
});

describe('Type.awaited', () => {
  test('answers what a single promise layer settles to', () => {
    expect(Type.awaited(Type.global('Promise', [CONN]))).toBe(CONN);
  });

  test('answers what the innermost layer settles to, however many deep', () => {
    const nested = Type.global('Promise', [Type.global('Promise', [Type.global('Promise', [CONN])])]);

    expect(Type.awaited(nested)).toBe(CONN);
  });

  test('answers a type that is not a promise as itself', () => {
    expect(Type.awaited(CONN)).toBe(CONN);
  });

  test('makes Type.promise of a nested promise a single layer', () => {
    expect(Type.promise(Type.global('Promise', [Type.global('Promise', [CONN])]))).toBe(Type.global('Promise', [CONN]));
  });
});
