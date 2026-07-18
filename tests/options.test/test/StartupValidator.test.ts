// StartupValidator (white-box via internal/*): forces evaluation of each
// collected options token and aggregates validation failures. Exercised against
// a hand-built fake IResolver so the unit stays independent of the DI runtime --
// the augmentation wiring is covered black-box in options.augmentations.test.

import type { IOptions } from '@rhombus-std/options/tokens/IOptions';
import { OptionsValidationError } from '@rhombus-std/options/tokens/OptionsValidationError';
import { StartupValidator } from '@rhombus-std/options/tokens/StartupValidator';
import { describe, expect, test } from 'bun:test';

// The constructor's first parameter is di.core's `IResolver`; reference it
// structurally so the test needs no di.core dependency.
type FakeResolver = ConstructorParameters<typeof StartupValidator>[0];

/** A IResolver whose `resolve(token)` returns the token's mapped `Options`. */
function resolverOf(map: Record<string, IOptions<unknown>>): FakeResolver {
  return {
    resolve(token: string): IOptions<unknown> {
      const options = map[token];
      if (options === undefined) {
        throw new Error(`no registration for ${token}`);
      }
      return options;
    },
  } as unknown as FakeResolver;
}

/** An `Options` that throws `error` the moment `.value` is read. */
function failing(error: unknown): IOptions<unknown> {
  return {
    get value(): unknown {
      throw error;
    },
  };
}

/**
 * A IResolver whose `resolve(token)` throws `error` outright -- models the
 * non-reactive assembly path, where `assembleOptions` builds eagerly at resolve
 * time so a failed validate step surfaces from `resolve()` itself, before any
 * `.value` read.
 */
function resolverThrowing(error: unknown): FakeResolver {
  return {
    resolve(): IOptions<unknown> {
      throw error;
    },
  } as unknown as FakeResolver;
}

describe('StartupValidator.validate', () => {
  test('all targets pass -> does not throw, forcing each value', () => {
    let reads = 0;
    const passing: IOptions<unknown> = {
      get value(): unknown {
        reads += 1;
        return { ok: true };
      },
    };
    const validator = new StartupValidator(resolverOf({ a: passing, b: passing }), ['a', 'b']);

    expect(() => validator.validate()).not.toThrow();
    expect(reads).toBe(2);
  });

  test('a single failure rethrows that OptionsValidationError as-is', () => {
    const failure = new OptionsValidationError(['port must be positive']);
    const validator = new StartupValidator(resolverOf({ a: failing(failure) }), ['a']);

    expect(() => validator.validate()).toThrow(failure);
  });

  test('multiple failures throw one AggregateError carrying each', () => {
    const first = new OptionsValidationError(['first bad']);
    const second = new OptionsValidationError(['second bad']);
    const validator = new StartupValidator(
      resolverOf({ a: failing(first), b: failing(second) }),
      ['a', 'b'],
    );

    try {
      validator.validate();
      throw new Error('expected validate() to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toEqual([first, second]);
    }
  });

  test('a validation error thrown eagerly from resolve() is caught like a .value failure', () => {
    const failure = new OptionsValidationError(['eager fail']);
    const validator = new StartupValidator(resolverThrowing(failure), ['a']);

    expect(() => validator.validate()).toThrow(failure);
  });

  test('a non-validation error propagates immediately, unwrapped', () => {
    const boom = new TypeError('not a validation failure');
    const validator = new StartupValidator(resolverOf({ a: failing(boom) }), ['a']);

    expect(() => validator.validate()).toThrow(boom);
  });

  test('duplicate tokens are forced only once', () => {
    let reads = 0;
    const counted: IOptions<unknown> = {
      get value(): unknown {
        reads += 1;
        return 1;
      },
    };
    const validator = new StartupValidator(resolverOf({ a: counted }), ['a', 'a', 'a']);

    validator.validate();
    expect(reads).toBe(1);
  });
});
