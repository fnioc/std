// The di.core-surface negative fact §225 rules for disposal: no dispose-specific error joins the
// shared taxonomy, since the standard model's disposed-scope refusal stays model-private and
// reaches a caller only wrapped in LifetimeModelError.

import * as core from '@rhombus-std/di.core';
import { describe, expect, test } from 'bun:test';

describe('the di.core taxonomy', () => {
  // §225 lines 3975-3976 — "No DisposedError in the di.core taxonomy."
  test('exports no DisposedError', () => {
    expect('DisposedError' in core).toBe(false);
  });
});
