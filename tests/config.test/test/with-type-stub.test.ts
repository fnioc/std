// Tier 2 seam -- the withType() augment + throwing runtime stub.
//
// Importing "@rhombus-std/config/with-type-augment" brings the withType()
// declaration (and its throwing prototype stub) into scope. Without the real
// @rhombus-std/config.transformer compile-time transform, calling it must fail loud
// rather than silently returning an un-coerced builder.
//
// This exercises the source module. The published-dist behavior (that the stub
// actually lands in dist/with-type-augment.js and throws under node) is covered
// by the integration package, which runs against built dist.

import { ConfigurationBuilder } from '@rhombus-std/config';
import { describe, expect, test } from 'bun:test';
import '@rhombus-std/config/with-type-augment';

describe('withType() Tier 2 stub', () => {
  test('is installed as a function on the builder prototype', () => {
    expect(typeof new ConfigurationBuilder().withType).toBe('function');
  });

  test("throws the 'transform did not run' error when called without the transformer", () => {
    expect(() => new ConfigurationBuilder().withType<{ Port: number; }>())
      .toThrow(/@rhombus-std\/config.transformer/);
  });
});
