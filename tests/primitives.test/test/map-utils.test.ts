import { getOrCreate } from '@rhombus-std/primitives';
import { describe, expect, it } from 'bun:test';

describe('getOrCreate', () => {
  it('creates, stores, and returns on a miss', () => {
    const map = new Map<string, number>();
    const value = getOrCreate(map, 'a', key => key.length);
    expect(value).toBe(1);
    expect(map.get('a')).toBe(1);
  });

  it('returns the stored value without calling the factory on a hit', () => {
    const map = new Map<string, number>([['a', 7]]);
    let calls = 0;
    const value = getOrCreate(map, 'a', () => {
      calls += 1;
      return 99;
    });
    expect(value).toBe(7);
    expect(calls).toBe(0);
  });

  it('treats a stored undefined as a hit', () => {
    const map = new Map<string, number | undefined>([['a', undefined]]);
    let calls = 0;
    const value = getOrCreate(map, 'a', () => {
      calls += 1;
      return 99;
    });
    expect(value).toBeUndefined();
    expect(calls).toBe(0);
  });

  it('passes the key to the factory', () => {
    const map = new Map<number, string>();
    expect(getOrCreate(map, 42, key => `#${key}`)).toBe('#42');
  });
});
