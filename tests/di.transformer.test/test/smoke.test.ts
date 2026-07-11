import { createTransformerFactory, transform } from '@rhombus-std/di.transformer';
import { expect, test } from 'bun:test';

// Smoke test: @rhombus-std/di.transformer resolves and exposes its ts-patch entry points.
// Real coverage (token gen, dep extraction, lowering, diagnostics) lives in the
// sibling test files.
test('@rhombus-std/di.transformer exposes its ts-patch entry points', () => {
  expect(typeof transform).toBe('function');
  expect(typeof createTransformerFactory).toBe('function');
});
