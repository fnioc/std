// Behaviour tests for Type.isOpen -- whether a type still holds a generic hole anywhere. Every
// position a hole can sit in is covered: a bare hole, an aggregate element, a nominal type's
// generic arguments, a callable's parameter signatures and head, a composite's members, an object's
// member values, and a tag's inner type.

import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const A = Type.imported('A', 'app');
const B = Type.imported('B', 'app');
const T = Type.generic('T');

describe('Type.isOpen', () => {
  test('a bare generic hole is open', () => {
    expect(Type.isOpen(T)).toBe(true);
  });

  test('a literal is never open', () => {
    expect(Type.isOpen(Type.typeLiteral(5))).toBe(false);
  });

  test('a closed identifier is not open', () => {
    expect(Type.isOpen(A)).toBe(false);
    expect(Type.isOpen(Type.global('string'))).toBe(false);
  });

  test('an aggregate is open exactly when its element is', () => {
    expect(Type.isOpen(Type.array(T))).toBe(true);
    expect(Type.isOpen(Type.array(A))).toBe(false);
    expect(Type.isOpen(Type.iterable(T))).toBe(true);
    expect(Type.isOpen(Type.iterable(A))).toBe(false);
  });

  test('a generic argument makes the nominal type carrying it open', () => {
    expect(Type.isOpen(Type.global('Box', [T]))).toBe(true);
    expect(Type.isOpen(Type.imported('Box', 'app', [T]))).toBe(true);
    expect(Type.isOpen(Type.imported('Box', 'app', [A]))).toBe(false);
  });

  test('a callable is open through any parameter signature or its own head', () => {
    expect(Type.isOpen(Type.func(A, [[T]]))).toBe(true);
    expect(Type.isOpen(Type.func(T, [[A]]))).toBe(true);
    expect(Type.isOpen(Type.func(A, [[A]]))).toBe(false);
    expect(Type.isOpen(Type.ctor(A, [[B], [T]]))).toBe(true);
    expect(Type.isOpen(Type.ctor(A, [[B]]))).toBe(false);
  });

  test('a union, intersection or tuple is open through any one member', () => {
    expect(Type.isOpen(Type.union(A, T))).toBe(true);
    expect(Type.isOpen(Type.intersection(Type.object({ a: A }), Type.object({ b: T })))).toBe(true);
    expect(Type.isOpen(Type.tuple(A, T))).toBe(true);
    expect(Type.isOpen(Type.tuple(A, B))).toBe(false);
  });

  test('a tuple is open through its rest slot too', () => {
    expect(Type.isOpen(Type.tuple({ members: [A], rest: T }))).toBe(true);
    expect(Type.isOpen(Type.tuple({ members: [A], rest: B }))).toBe(false);
  });

  test('an object is open through any one member value', () => {
    expect(Type.isOpen(Type.object({ a: A, b: T }))).toBe(true);
    expect(Type.isOpen(Type.object({ a: A, b: B }))).toBe(false);
  });

  test('a tag is open exactly when its inner type is', () => {
    expect(Type.isOpen(Type.tag(T, 'primary'))).toBe(true);
    expect(Type.isOpen(Type.tag(A, 'primary'))).toBe(false);
  });
});
