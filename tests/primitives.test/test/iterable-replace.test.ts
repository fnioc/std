// Coverage for replace()'s four faces (src/toolkit/iterable.ts): a value match
// paired with a value or mapper replacement, each either same-typed or
// widening the yielded type.

import { replace } from '@rhombus-toolkit/obj';
import { describe, expect, test } from 'bun:test';

describe('replace', () => {
  test('value match, same-typed value replacement', () => {
    expect([...replace([1, 2, 3, 2], 2, 9)]).toEqual([1, 9, 3, 9]);
  });

  test('value match, widening value replacement', () => {
    expect([...replace([1, 2, 3], 2, 'two')]).toEqual([1, 'two', 3]);
  });

  test('value match, same-typed mapper replacement', () => {
    expect([...replace([1, 2, 3, 2], 2, (n) => n * 10)]).toEqual([1, 20, 3, 20]);
  });

  test('value match, widening mapper replacement', () => {
    expect([...replace([1, 2, 3], 2, (n) => `#${n}`)]).toEqual([1, '#2', 3]);
  });

  test('predicate match still selects items, paired with a value replacement', () => {
    expect([...replace([1, 2, 3, 4], (n) => n % 2 === 0, 0)]).toEqual([1, 0, 3, 0]);
  });

  test('predicate match paired with a mapper replacement', () => {
    expect([...replace([1, 2, 3, 4], (n) => n % 2 === 0, (n) => n * 100)]).toEqual([1, 200, 3, 400]);
  });

  test('no match leaves every element untouched', () => {
    expect([...replace([1, 2, 3], 9, 0)]).toEqual([1, 2, 3]);
  });

  test('a mapper replacement runs only on a match', () => {
    let calls = 0;
    const mapper = (n: number) => {
      calls++;
      return n * 10;
    };
    expect([...replace([1, 2, 3], 2, mapper)]).toEqual([1, 20, 3]);
    expect(calls).toBe(1);
  });
});
