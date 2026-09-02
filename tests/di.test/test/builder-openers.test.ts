// Behaviour tests for the chain openers: services or an addon may open the chain, and either
// way the built provider resolves what was filed. No lifetime model stands anywhere here.

import { Builder } from '@rhombus-std/di';
import { type Addon, Registration } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const GREETING = Type.imported('Greeting', 'app');

describe('the chain openers', () => {
  test('withServices opens the chain and its registrations resolve', () => {
    const provider = Builder.withServices(manifest => manifest.add(Registration.value(GREETING, 'hello'))).build();

    expect(provider.getService(GREETING)).toBe('hello');
  });

  test('useAddon opens the chain and its registrations resolve', () => {
    const addon: Addon<unknown> = {
      registrations: [Registration.value(GREETING, 'hello')],
      middleware: next => next,
    };

    expect(Builder.useAddon(addon).build().getService(GREETING)).toBe('hello');
  });

  test("an addon's middleware sees each ask on its way to the engine", () => {
    const seen: Type[] = [];
    const observing: Addon<unknown> = {
      registrations: [Registration.value(GREETING, 'hello')],
      middleware: next => request => {
        seen.push(request.type);
        return next(request);
      },
    };

    expect(Builder.useAddon(observing).build().getService(GREETING)).toBe('hello');
    expect(seen).toEqual([GREETING]);
  });
});
