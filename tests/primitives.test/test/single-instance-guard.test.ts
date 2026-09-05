// The single-instance guard: importing the barrel stamps a process-wide
// sentinel, and a second, different copy fails fast. The suite's own barrel
// import put the real stamp in place, so a second copy is simulated by
// re-invoking the stamping routine with a foreign module URL.

import { stampSingleInstance } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const globals = globalThis as unknown as Record<symbol, unknown>;
const primitivesSlot = Symbol.for('rhombus-toolkit:@rhombus-std/primitives/instance');

describe('single-instance guard', () => {
  test('loading the barrel stamps the sentinel with a module URL', () => {
    const stamped = globals[primitivesSlot];
    expect(typeof stamped).toBe('string');
    expect(stamped as string).toContain('primitives');
  });

  test('re-evaluating the same copy stays silent', () => {
    const stamped = globals[primitivesSlot] as string;
    expect(() => {
      stampSingleInstance('@rhombus-std/primitives', stamped);
    }).not.toThrow();
    expect(globals[primitivesSlot]).toBe(stamped);
  });

  test('a second, different copy throws, naming both module URLs', () => {
    const stamped = globals[primitivesSlot] as string;
    const other = 'file:///elsewhere/node_modules/@rhombus-std/primitives/dist/bundle/index.js';
    let caught: unknown;
    try {
      stampSingleInstance('@rhombus-std/primitives', other);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toContain(stamped);
    expect(message).toContain(other);
    expect(message).toContain('Deduplicate');
    expect(globals[primitivesSlot]).toBe(stamped);
  });

  test('the first claim of a fresh slot stamps it', () => {
    const name = '@rhombus-std/primitives.test/guard-fixture';
    const slot = Symbol.for(`rhombus-toolkit:${name}/instance`);
    try {
      expect(globals[slot]).toBeUndefined();
      stampSingleInstance(name, 'file:///a.js');
      expect(globals[slot]).toBe('file:///a.js');
      stampSingleInstance(name, 'file:///a.js');
      expect(globals[slot]).toBe('file:///a.js');
      expect(() => {
        stampSingleInstance(name, 'file:///b.js');
      }).toThrow();
    } finally {
      delete globals[slot];
    }
  });
});
