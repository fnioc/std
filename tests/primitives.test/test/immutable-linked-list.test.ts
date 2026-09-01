// Behavior tests for ImmutableLinkedList -- persistence is the load-bearing part: a list handed out stays
// exactly what it was however much is added or removed afterwards, and both ends are known without
// walking for either.

import { ImmutableLinkedList } from '@rhombus-std/primitives/private/toolkit/ImmutableLinkedList';
import { describe, expect, test } from 'bun:test';

/** `values` as a list, the first of them ending up at the tail. */
function listOf<T>(...values: readonly T[]) {
  return values.reduce<ImmutableLinkedList<T>>((list, value) => list.push(value), ImmutableLinkedList.empty<T>());
}

describe('ImmutableLinkedList', () => {
  test('an empty list holds nothing at either end', () => {
    expect(ImmutableLinkedList.empty().size).toBe(0);
    expect(ImmutableLinkedList.empty().head).toBeUndefined();
    expect(ImmutableLinkedList.empty().tail).toBeUndefined();
    expect([...ImmutableLinkedList.empty()]).toEqual([]);
  });

  test('pushes onto the empty list with nothing to infer from but the value', () => {
    const list = ImmutableLinkedList.empty<number>().push(33);

    expect(list.head).toBe(33);
    expect(list.size).toBe(1);
  });

  test('adding puts the value at the head and leaves the tail where it was', () => {
    const list = listOf('oldest', 'middle', 'newest');

    expect(list.size).toBe(3);
    expect(list.head).toBe('newest');
    expect(list.tail).toBe('oldest');
  });

  test('adding leaves the list added to untouched', () => {
    const before = listOf('a', 'b');
    const after = before.push('c');

    expect([...before]).toEqual(['b', 'a']);
    expect([...after]).toEqual(['c', 'b', 'a']);
    expect(before.size).toBe(2);
  });

  test('reads from the head, and from the tail on request', () => {
    const list = listOf('oldest', 'middle', 'newest');

    expect([...list]).toEqual(['newest', 'middle', 'oldest']);
    expect(list.tailToHead()).toEqual(['oldest', 'middle', 'newest']);
  });

  test('the tail-to-head order is settled once and answered from then on', () => {
    const list = listOf('a', 'b');

    expect(list.tailToHead()).toBe(list.tailToHead());
  });

  test('removing answers the list itself when nothing matches', () => {
    const list = listOf('a', 'b');

    expect(list.remove(value => value === 'absent')).toBe(list);
  });

  test('removing drops the first match and leaves the list removed from untouched', () => {
    const before = listOf('a', 'b', 'c');
    const after = before.remove(value => value === 'b');

    expect([...after]).toEqual(['c', 'a']);
    expect(after.size).toBe(2);
    expect([...before]).toEqual(['c', 'b', 'a']);
  });

  test('removing what stood at an end moves that end', () => {
    const list = listOf('oldest', 'newest');

    expect(list.remove(value => value === 'oldest').tail).toBe('newest');
    expect(list.remove(value => value === 'newest').head).toBe('oldest');
  });
});
