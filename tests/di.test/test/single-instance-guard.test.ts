// The single-instance guard on di.core: importing the barrel stamps a
// process-wide sentinel, and a second, different copy fails fast. A second
// copy is simulated by re-invoking the shared stamping routine against
// di.core's slot with a foreign module URL.

import { DefaultManifest } from '@rhombus-std/di.core';
import { stampSingleInstance } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const globals = globalThis as unknown as Record<symbol, unknown>;
const diCoreSlot = Symbol.for('@rhombus-std/di.core/instance');

describe('single-instance guard', () => {
  test('loading the barrel stamps the sentinel with a module URL', () => {
    expect(DefaultManifest).toBeDefined();
    const stamped = globals[diCoreSlot];
    expect(typeof stamped).toBe('string');
    expect(stamped as string).toContain('di.core');
  });

  test('re-evaluating the same copy stays silent', () => {
    const stamped = globals[diCoreSlot] as string;
    expect(() => {
      stampSingleInstance('@rhombus-std/di.core', stamped);
    }).not.toThrow();
    expect(globals[diCoreSlot]).toBe(stamped);
  });

  test('a second, different copy throws, naming both module URLs', () => {
    const stamped = globals[diCoreSlot] as string;
    const other = 'file:///elsewhere/node_modules/@rhombus-std/di.core/dist/bundle/index.js';
    let caught: unknown;
    try {
      stampSingleInstance('@rhombus-std/di.core', other);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toContain(stamped);
    expect(message).toContain(other);
    expect(message).toContain('Deduplicate');
    expect(globals[diCoreSlot]).toBe(stamped);
  });
});
