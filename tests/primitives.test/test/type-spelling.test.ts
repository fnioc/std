// Behaviour tests for how a `Type` reads as text and as JSON: it spells itself wherever a string
// is expected, and its JSON form is the raw tree that `Type.adopt` and `Type.reviver` read back.

import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const A = Type.imported('A', 'app');
const box = Type.imported('Box', 'app', [Type.union(Type.global('string'), Type.typeLiteral(5))]);

describe('a type spells itself', () => {
  test('every string context yields the token', () => {
    const token = Type.stringify(box);
    expect(`${box}`).toBe(token);
    expect(String(box)).toBe(token);
    expect(box.toString()).toBe(token);
    expect(box + '').toBe(token);
    expect([A, box].join(' -> ')).toBe(`${Type.stringify(A)} -> ${token}`);
  });

  test('the tag and the inspect hook name the type', () => {
    expect(Object.prototype.toString.call(box)).toBe('[object Type]');
    expect(Bun.inspect(box)).toBe(Type.stringify(box));
  });

  test('a node carries its fields and nothing else', () => {
    expect(Object.keys(box).sort()).toEqual(['from', 'genericArgs', 'kind', 'name']);
    expect(Object.isFrozen(box)).toBe(true);
    expect(Object.isFrozen(box.genericArgs)).toBe(true);
  });
});

describe('a type reads back from JSON', () => {
  test('what is written is the raw tree', () => {
    expect(JSON.parse(JSON.stringify(box))).toEqual({
      kind: 'imported',
      name: 'Box',
      from: 'app',
      genericArgs: [
        {
          kind: 'union',
          members: [
            {
              kind: 'global',
              name: 'string',
              genericArgs: [],
            },
            {
              kind: 'literal',
              value: 5,
            },
          ],
        },
      ],
    });
  });

  test('a document that is one type adopts back to the same object', () => {
    expect(Type.adopt(JSON.parse(JSON.stringify(box)))).toBe(box);
  });

  test('the reviver adopts a type wherever one is embedded', () => {
    const document = JSON.stringify({
      address: box,
      rows: [{ address: A }],
      nested: { deeper: { address: Type.tuple(A, box) } },
    });

    const read = JSON.parse(document, Type.reviver);

    expect(read.address).toBe(box);
    expect(read.rows[0].address).toBe(A);
    expect(read.nested.deeper.address).toBe(Type.tuple(A, box));
    expect(read.nested.deeper.address.members[1]).toBe(box);
  });

  test('anything that is not a type is left as it was parsed', () => {
    const document = JSON.stringify({
      failure: { kind: 'error', message: 'nope' },
      partial: { kind: 'array', items: [] },
      count: 5,
      values: [1, 'two', null],
      absent: null,
    });

    const read = JSON.parse(document, Type.reviver);

    expect(read.failure).toEqual({ kind: 'error', message: 'nope' });
    expect(read.partial).toEqual({ kind: 'array', items: [] });
    expect(read.count).toBe(5);
    expect(read.values).toEqual([1, 'two', null]);
    expect(read.absent).toBeNull();
  });
});
