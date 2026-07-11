// Behavior + assignability tests for primitives' owned AbortSignal/
// AbortController typings (see src/abort.ts). Confirms the constructor
// re-export is the platform global, and that our structural interfaces are
// mutually assignable with the platform types (bun/node's, in this test
// package's `types: ["bun"]` program).

import { AbortController, type AbortSignal } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

describe('AbortController (owned typings)', () => {
  test('is the platform global', () => {
    expect(AbortController).toBe(globalThis.AbortController);
  });

  test('signal.aborted flips on abort()', () => {
    const controller = new AbortController();
    expect(controller.signal.aborted).toBe(false);

    controller.abort();
    expect(controller.signal.aborted).toBe(true);
  });

  test("an 'abort' listener registered with { once: true } fires exactly once", () => {
    const controller = new AbortController();
    let callCount = 0;
    controller.signal.addEventListener('abort', () => {
      callCount++;
    }, { once: true });

    controller.abort();
    controller.abort();
    expect(callCount).toBe(1);
  });

  test('reason propagates through abort()', () => {
    const controller = new AbortController();
    controller.abort('because');
    expect(controller.signal.reason).toBe('because');
  });
});

describe('AbortSignal (owned typings) -- compile-time mutual assignability', () => {
  test('a platform AbortSignal is assignable to our AbortSignal', () => {
    const platformSignal: globalThis.AbortSignal = new globalThis.AbortController().signal;
    const ourSignal: AbortSignal = platformSignal;
    expect(ourSignal.aborted).toBe(false);
  });

  test('our AbortSignal is assignable to a platform-typed binding', () => {
    const ourSignal: AbortSignal = new AbortController().signal;
    const platformSignal: globalThis.AbortSignal = ourSignal;
    expect(platformSignal.aborted).toBe(false);
  });
});
