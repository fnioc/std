// Behaviour tests for the validation addons: `validateCaptivity` walks every buildable address
// for captive pairs, and `validateBuildability` plans every closed address up front — both run
// their sweep at `build()`, so a broken manifest never produces a provider.

import { di, standard, StandardScopeFactory, standardValidationPolicy, validateBuildability, validateCaptivity } from '@rhombus-std/di';
import { CaptiveDependencyError, type IServiceProvider, ManifestValidationError } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const SCOPED = Type.imported('Scoped', 'app');
const SINGLETON = Type.imported('Singleton', 'app');
const TRANSIENT = Type.imported('Transient', 'app');
const A = Type.imported('A', 'app');
const B = Type.imported('B', 'app');
const FACTORY = Type.imported('Factory', 'app');

class Scoped {}
class Singleton {
  constructor(readonly scoped: Scoped) {}
}
class Transient {
  constructor(readonly singleton: Singleton) {}
}
class NeedsB {
  constructor(readonly b: unknown) {}
}

/** Opens a scope the way a user without the engine-typed provider does — through the published address. */
function openScope(provider: IServiceProvider): IServiceProvider {
  return (provider.resolve(StandardScopeFactory.address) as StandardScopeFactory).openScope();
}

describe('validateCaptivity', () => {
  test('a captive dependency reached through an intervening transient throws ManifestValidationError naming the owner and the captured node', () => {
    let caught: unknown;
    try {
      di.usingLifetimeModel(standard())
        .configureServices(manifest =>
          manifest
            .add(SCOPED, Scoped, Type.ctor(SCOPED, [[]]), 'scoped')
            .add(SINGLETON, Singleton, Type.ctor(SINGLETON, [[SCOPED]]), 'singleton')
            .add(TRANSIENT, Transient, Type.ctor(TRANSIENT, [[SINGLETON]]), 'transient')
        )
        .useAddon(validateCaptivity(standardValidationPolicy))
        .build();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ManifestValidationError);
    const [captured] = (caught as ManifestValidationError).errors;
    expect(captured).toBeInstanceOf(CaptiveDependencyError);
    expect((captured as CaptiveDependencyError).ownerAddress).toBe(SINGLETON);
    expect((captured as CaptiveDependencyError).nodeAddress).toBe(SCOPED);
  });

  test("a scoped registration resolved from the root provider is kept for the container's lifetime", () => {
    const provider = di.usingLifetimeModel(standard())
      .configureServices(manifest => manifest.add(SCOPED, Scoped, Type.ctor(SCOPED, [[]]), 'scoped'))
      .useAddon(validateCaptivity(standardValidationPolicy))
      .build();

    expect(provider.resolve(SCOPED)).toBe(provider.resolve(SCOPED));
  });

  test('the same resolution from an opened scope succeeds', () => {
    const provider = di.usingLifetimeModel(standard())
      .configureServices(manifest => manifest.add(SCOPED, Scoped, Type.ctor(SCOPED, [[]]), 'scoped'))
      .useAddon(validateCaptivity(standardValidationPolicy))
      .build();

    expect(openScope(provider).resolve(SCOPED)).toBeInstanceOf(Scoped);
  });

  test('without the addon, a captive dependency silently caches instead of throwing — the current standard-model semantics', () => {
    const provider = di.usingLifetimeModel(standard())
      .configureServices(manifest =>
        manifest
          .add(SCOPED, Scoped, Type.ctor(SCOPED, [[]]), 'scoped')
          .add(SINGLETON, Singleton, Type.ctor(SINGLETON, [[SCOPED]]), 'singleton')
      )
      .build();

    expect((provider.resolve(SINGLETON) as Singleton).scoped).toBe(provider.resolve(SCOPED));
  });
});

describe('validateBuildability', () => {
  test('aggregates an unsatisfiable closed address into a ManifestValidationError thrown from build()', () => {
    expect(
      () =>
        di.usingLifetimeModel(standard())
          .configureServices(manifest => manifest.add(A, NeedsB, Type.ctor(A, [[B]]), 'singleton'))
          .useAddon(validateBuildability())
          .build(),
    ).toThrow(ManifestValidationError);
  });

  test('never invokes a registered factory — only its signature is checked', () => {
    let invoked = false;
    const provider = di.usingLifetimeModel(standard())
      .configureServices(manifest =>
        manifest.add(FACTORY, () => {
          invoked = true;
          throw new Error('the sweep must not call this');
        }, Type.func(FACTORY, [[]]), 'singleton')
      )
      .useAddon(validateBuildability())
      .build();

    expect(provider).toBeDefined();
    expect(invoked).toBe(false);
  });

  test('a captive dependency, being structurally buildable, does not trip validateBuildability on its own', () => {
    const provider = di.usingLifetimeModel(standard())
      .configureServices(manifest =>
        manifest
          .add(SCOPED, Scoped, Type.ctor(SCOPED, [[]]), 'scoped')
          .add(SINGLETON, Singleton, Type.ctor(SINGLETON, [[SCOPED]]), 'singleton')
      )
      .useAddon(validateBuildability())
      .build();

    expect(provider).toBeDefined();
  });
});
