// Behavior tests for the OptionsFactory pipeline (docs/decisions.md §4.5):
// make base -> configure steps -> post-configure steps -> validate -> return.

import { OptionsFactory } from '@rhombus-std/options/internal/OptionsFactory';
import { OptionsValidationError } from '@rhombus-std/options/internal/OptionsValidationError';
import type { ValidateOptions } from '@rhombus-std/options/internal/ValidateOptions';
import { ValidateOptionsResult } from '@rhombus-std/options/internal/ValidateOptionsResult';
import { describe, expect, test } from 'bun:test';

interface Settings {
  port: number;
  host: string;
  log: string[];
}

function makeBase(): Settings {
  return { port: 0, host: '', log: [] };
}

describe('OptionsFactory.create', () => {
  test('a zero-step factory returns the base instance unchanged', () => {
    const factory = new OptionsFactory<Settings>(makeBase, [], []);
    expect(factory.create()).toEqual({ port: 0, host: '', log: [] });
  });

  test('configure steps run in registration order', () => {
    const factory = new OptionsFactory<Settings>(
      makeBase,
      [
        { configure: (o) => o.log.push('a') },
        { configure: (o) => o.log.push('b') },
        { configure: (o) => o.log.push('c') },
      ],
      [],
    );
    expect(factory.create().log).toEqual(['a', 'b', 'c']);
  });

  test('post-configure runs after every configure step -- and gets the last word', () => {
    const factory = new OptionsFactory<Settings>(
      makeBase,
      [
        { configure: (o) => o.log.push('configure') },
        { configure: (o) => (o.port = 8080) },
      ],
      [
        { postConfigure: (o) => o.log.push('post') },
        { postConfigure: (o) => (o.port = 9090) },
      ],
    );
    const result = factory.create();
    expect(result.log).toEqual(['configure', 'post']);
    expect(result.port).toBe(9090);
  });

  test('validate sees the post-configured value, not the mid-configure one', () => {
    const seen: number[] = [];
    const recordPort: ValidateOptions<Settings> = {
      validate: (o) => {
        seen.push(o.port);
        return ValidateOptionsResult.success;
      },
    };
    const factory = new OptionsFactory<Settings>(
      makeBase,
      [{ configure: (o) => (o.port = 8080) }],
      [{ postConfigure: (o) => (o.port = 9090) }],
      [recordPort],
    );
    factory.create();
    expect(seen).toEqual([9090]);
  });

  test('a passing validator returns the built value', () => {
    const factory = new OptionsFactory<Settings>(
      makeBase,
      [{ configure: (o) => (o.port = 8080) }],
      [],
      [{ validate: (o) => o.port > 0 ? ValidateOptionsResult.success : ValidateOptionsResult.fail('bad') }],
    );
    expect(factory.create().port).toBe(8080);
  });

  test('skip and success validators do not fail the pipeline', () => {
    const factory = new OptionsFactory<Settings>(
      makeBase,
      [],
      [],
      [
        { validate: () => ValidateOptionsResult.skip },
        { validate: () => ValidateOptionsResult.success },
      ],
    );
    expect(() => factory.create()).not.toThrow();
  });

  test('validation failures across every step aggregate into one OptionsValidationError', () => {
    const factory = new OptionsFactory<Settings>(
      makeBase,
      [],
      [],
      [
        { validate: () => ValidateOptionsResult.fail('port is required') },
        { validate: () => ValidateOptionsResult.skip },
        { validate: () => ValidateOptionsResult.fail(['host is required', 'host must be a name']) },
      ],
    );

    expect(() => factory.create()).toThrow(OptionsValidationError);

    try {
      factory.create();
      throw new Error('expected create() to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(OptionsValidationError);
      const validationError = error as OptionsValidationError;
      expect(validationError.failures).toEqual([
        'port is required',
        'host is required',
        'host must be a name',
      ]);
      expect(validationError.message).toBe(
        'port is required; host is required; host must be a name',
      );
    }
  });
});

describe('ValidateOptionsResult', () => {
  test('success and skip are non-failing', () => {
    expect(ValidateOptionsResult.success.succeeded).toBe(true);
    expect(ValidateOptionsResult.success.failed).toBe(false);
    expect(ValidateOptionsResult.skip.skipped).toBe(true);
    expect(ValidateOptionsResult.skip.failed).toBe(false);
  });

  test('fail(string) becomes a one-element failure list', () => {
    const result = ValidateOptionsResult.fail('nope');
    expect(result.failed).toBe(true);
    expect(result.failures).toEqual(['nope']);
    expect(result.failureMessage).toBe('nope');
  });

  test('fail(list) joins the messages into failureMessage', () => {
    const result = ValidateOptionsResult.fail(['one', 'two']);
    expect(result.failures).toEqual(['one', 'two']);
    expect(result.failureMessage).toBe('one; two');
  });
});
