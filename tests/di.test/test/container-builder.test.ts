// Behaviour tests for `Builder`, the container's front door. It composes services and addons in
// call order, and every step is a pure delegate over an immutable value — so what a discarded
// return registers, and what an intermediate `build()` sees, are the properties worth pinning down.

import { Builder, validateBuildability } from '@rhombus-std/di';
import { type Addon, type IServiceScopeFactory, Manifest, ManifestValidationError, Registration, UnsatisfiableError } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const A = Type.imported('A', 'app');
const B = Type.imported('B', 'app');
const SCOPE_FACTORY = Type.imported('IServiceScopeFactory', '@rhombus-std/di.core');

class Impl {}
class NeedsB {}

describe('a single withServices step', () => {
  test('resolves the value it registered', () => {
    const provider = Builder.withServices(manifest => manifest.addValue(A, 'a')).build();
    expect(provider.resolve(A)).toBe('a');
  });
});

describe('several withServices steps', () => {
  test('each files its own registrations, and the built provider answers all of them', () => {
    const provider = Builder.withServices(manifest => manifest.addValue(A, 'a'))
      .withServices(manifest => manifest.addValue(B, 'b'))
      .build();
    expect(provider.resolve(A)).toBe('a');
    expect(provider.resolve(B)).toBe('b');
  });

  test('a later step wins over an earlier one at the same address', () => {
    const provider = Builder.withServices(manifest => manifest.addValue(A, 'older'))
      .withServices(manifest => manifest.addValue(A, 'newer'))
      .build();
    expect(provider.resolve(A)).toBe('newer');
  });

  test('a step that discards the manifest it registered onto registers nothing', () => {
    const provider = Builder.withServices(manifest => {
      manifest.addValue(A, 'a');
      return manifest;
    }).build();
    expect(() => provider.resolve(A)).toThrow(UnsatisfiableError);
  });
});

describe('a ready-made manifest', () => {
  test('opens the chain as a step answering it whole', () => {
    const seed = Manifest.empty<unknown>().addValue(A, 'seeded');
    const provider = Builder.withServices(() => seed).build();
    expect(provider.resolve(A)).toBe('seeded');
  });

  test('keeps its iteration order: a newer registration still wins over an older one', () => {
    const seed = Manifest.empty<unknown>()
      .addValue(A, 'older')
      .addValue(A, 'newer');
    const provider = Builder.withServices(() => seed).build();
    expect(provider.resolve(A)).toBe('newer');
  });
});

describe('builder immutability', () => {
  test("an intermediate builder's build() excludes steps derived from it later", () => {
    const intermediate = Builder.withServices(manifest => manifest.addValue(A, 'a'));
    const _later: Builder<unknown> = intermediate.withServices(manifest => manifest.addValue(B, 'b'));

    const provider = intermediate.build();
    expect(provider.resolve(A)).toBe('a');
    expect(() => provider.resolve(B)).toThrow(UnsatisfiableError);
  });
});

describe('useAddon', () => {
  test('an ask crosses the addons in call order, the first installed outermost', () => {
    const order: string[] = [];
    const probe = (name: string): Addon<unknown> => ({
      registrations: [],
      middleware: next => request => {
        order.push(name);
        return next(request);
      },
    });

    const provider = Builder.useAddon(probe('first'))
      .useAddon(probe('second'))
      .withServices(manifest => manifest.addValue(A, 'a'))
      .build();
    provider.resolve(A);

    expect(order).toEqual(['first', 'second']);
  });

  test("a later addon's registration wins over an earlier one's at the same address", () => {
    const filing = (value: string): Addon<unknown> => ({
      registrations: [Registration.value(A, value)],
      middleware: next => next,
    });

    const provider = Builder.useAddon(filing('older')).useAddon(filing('newer')).build();
    expect(provider.resolve(A)).toBe('newer');
  });
});

describe('the validateBuildability addon', () => {
  test('throws ManifestValidationError when a closed address is unsatisfiable', () => {
    expect(
      () =>
        Builder.withServices(manifest => manifest.add(A, NeedsB, Type.ctor(A, [[B]])))
          .useAddon(validateBuildability())
          .build(),
    ).toThrow(ManifestValidationError);
  });

  test('without the addon, an unsatisfiable graph builds — the failure surfaces on resolution', () => {
    const provider = Builder.withServices(manifest => manifest.add(A, NeedsB, Type.ctor(A, [[B]]))).build();
    expect(() => provider.resolve(A)).toThrow(UnsatisfiableError);
  });

  test('does not throw when every closed address is satisfiable', () => {
    const provider = Builder.withServices(manifest => manifest.add(A, Impl, Type.ctor(A, [[]])))
      .useAddon(validateBuildability())
      .build();
    expect(provider.resolve(A)).toBeInstanceOf(Impl);
  });
});

describe('the scope-opening address', () => {
  test('is unsatisfiable while no lifetime model is installed', () => {
    const provider = Builder.withServices(manifest => manifest).build();
    expect(() => provider.resolve(SCOPE_FACTORY)).toThrow(UnsatisfiableError);
  });

  test('is a registration like any other, so a container can answer it itself', () => {
    const scope = Builder.withServices(manifest => manifest).build();
    const provider = Builder.withServices(manifest => manifest.addValue(SCOPE_FACTORY, { openScope: () => scope })).build();

    expect((provider.resolve(SCOPE_FACTORY) as IServiceScopeFactory).openScope()).toBe(scope);
  });
});
