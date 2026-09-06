// Behaviour tests for the address-validation addon: what it reads at build, what it reads at the
// ask door, and the two knobs that decide whether a warning stops anything.

import { Builder, validateAddresses } from '@rhombus-std/di';
import { addressRules, Registration } from '@rhombus-std/di.core';
import { Type, TypeValidationError } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const CONN = Type.imported('Conn', 'app');
const WIDGET = Type.imported('Widget', 'app');

/** The ids the leaves of an aggregate name. */
function reportedIds(error: unknown): string[] {
  return ((error as AggregateError).errors as TypeValidationError[]).map(leaf => leaf.id);
}

describe('validateAddresses', () => {
  test('reads every registration address at build, naming the rule each one tripped', () => {
    const build = () =>
      Builder.withServices(manifest => manifest.add(Registration.value(Type.union(CONN, WIDGET), 'either')))
        .useAddon(validateAddresses({ warningsAsErrors: true }))
        .build();

    expect(build).toThrow(AggregateError);
    try {
      build();
      expect.unreachable();
    } catch (error) {
      expect(reportedIds(error)).toContain('DI1013');
      expect((error as AggregateError).message).toContain('fail validation');
    }
  });

  test('lets a warning stand until warnings are read as errors', () => {
    const provider = Builder.withServices(manifest => manifest.add(Registration.value(Type.union(CONN, WIDGET), 'either')))
      .useAddon(validateAddresses())
      .build();

    expect(provider.getService(Type.union(CONN, WIDGET))).toBe('either');
  });

  test('drops the rules suppress names, from both sides', () => {
    const provider = Builder.withServices(manifest => manifest.add(Registration.value(Type.union(CONN, WIDGET), 'either')))
      .useAddon(validateAddresses({ warningsAsErrors: true, suppress: ['DI1013'] }))
      .build();

    expect(provider.getService(Type.union(CONN, WIDGET))).toBe('either');
  });

  test('reads each ask address at the door, by the ask rules rather than the registration ones', () => {
    const provider = Builder.withServices(manifest => manifest.add(Registration.value(CONN, 'conn')))
      .useAddon(validateAddresses({ warningsAsErrors: true }))
      .build();

    try {
      provider.getService(Type.undefinedLiteral);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError);
      expect(reportedIds(error)).toEqual(['DI1012']);
    }
  });

  test('passes an ask no rule objects to', () => {
    const provider = Builder.withServices(manifest => manifest.add(Registration.value(CONN, 'conn')))
      .useAddon(validateAddresses({ warningsAsErrors: true }))
      .build();

    expect(provider.getService(CONN)).toBe('conn');
  });

  test('passes a tryResolve ask, whose address carries the undefined literal as its fallback', () => {
    const provider = Builder.withServices(manifest => manifest.add(Registration.value(CONN, 'conn')))
      .useAddon(validateAddresses({ warningsAsErrors: true }))
      .build();

    expect(provider.tryResolve(CONN)).toBe('conn');
    expect(provider.tryResolve(WIDGET)).toBeUndefined();
  });

  test('passes a tryResolveAsync ask, whose address is a promise of that same fallback', async () => {
    const provider = Builder.withServices(manifest => manifest.add(Registration.value(CONN, 'conn')))
      .useAddon(validateAddresses({ warningsAsErrors: true }))
      .build();

    await expect(provider.tryResolveAsync(CONN)).resolves.toBe('conn');
    await expect(provider.tryResolveAsync(WIDGET)).resolves.toBeUndefined();
  });

  test('reads the rules handed to it in place of the preset', () => {
    const build = () =>
      Builder.withServices(manifest => manifest.add(Registration.value(Type.union(CONN, WIDGET), 'either')))
        .useAddon(validateAddresses({ registration: [addressRules.byId.DI1014!], warningsAsErrors: true }))
        .build();

    expect(build).not.toThrow();
  });
});
