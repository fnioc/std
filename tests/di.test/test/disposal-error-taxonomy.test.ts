// The disposed refusal's place in the di.core taxonomy: `ObjectDisposedError` is the one error a
// resolution or scope opening raises once its container or scope has ended, shared by both
// lifetime models and reachable from the abstractions alone.

import * as di from '@rhombus-std/di';
import * as core from '@rhombus-std/di.core';
import { DiError, ObjectDisposedError } from '@rhombus-std/di.core';
import { describe, expect, test } from 'bun:test';

describe('the disposed refusal in the taxonomy', () => {
  test('carries ObjectDisposedError beneath DiError, so a library holding only the abstractions can classify the refusal', () => {
    const error = new ObjectDisposedError();
    expect(error).toBeInstanceOf(DiError);
    expect(error.name).toBe('ObjectDisposedError');
  });

  test('the engine package re-exports the same class, so instanceof holds whichever specifier a caller imported from', () => {
    expect(di.ObjectDisposedError).toBe(ObjectDisposedError);
  });

  test('no other disposal error joins it', () => {
    expect('DisposedError' in core).toBe(false);
  });
});
