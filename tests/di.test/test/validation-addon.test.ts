// Behaviour tests for the `validation` addon: the runtime scope guard `validateScopes` installs,
// and the up-front sweep `validateOnBuild` runs at `build()`.

import { di, standard, StandardScopeFactory, standardValidationPolicy, validation } from '@rhombus-std/di';
import { CaptiveDependencyError, type IServiceProvider, ManifestValidationError, ScopedFromRootError } from '@rhombus-std/di.core';
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

describe('validateScopes', () => {
  test('a captive dependency reached through an intervening transient throws CaptiveDependencyError naming the owner and the captured node', () => {
    const provider = di.usingLifetimeModel(standard())
      .configureServices(manifest =>
        manifest
          .add(SCOPED, Scoped, Type.ctor(SCOPED, [[]]), 'scoped')
          .add(SINGLETON, Singleton, Type.ctor(SINGLETON, [[SCOPED]]), 'singleton')
          .add(TRANSIENT, Transient, Type.ctor(TRANSIENT, [[SINGLETON]]), 'transient')
      )
      .withAddon(validation(standardValidationPolicy, { validateScopes: true }))
      .build();

    let caught: unknown;
    try {
      provider.resolve(TRANSIENT);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(CaptiveDependencyError);
    expect((caught as CaptiveDependencyError).ownerAddress).toBe(SINGLETON);
    expect((caught as CaptiveDependencyError).nodeAddress).toBe(SCOPED);
  });

  test('resolving a scoped registration from the root provider throws ScopedFromRootError', () => {
    const provider = di.usingLifetimeModel(standard())
      .configureServices(manifest => manifest.add(SCOPED, Scoped, Type.ctor(SCOPED, [[]]), 'scoped'))
      .withAddon(validation(standardValidationPolicy, { validateScopes: true }))
      .build();

    expect(() => provider.resolve(SCOPED)).toThrow(ScopedFromRootError);
  });

  test('the same resolution from an opened scope succeeds', () => {
    const provider = di.usingLifetimeModel(standard())
      .configureServices(manifest => manifest.add(SCOPED, Scoped, Type.ctor(SCOPED, [[]]), 'scoped'))
      .withAddon(validation(standardValidationPolicy, { validateScopes: true }))
      .build();

    expect(openScope(provider).resolve(SCOPED)).toBeInstanceOf(Scoped);
  });

  test('off, a captive dependency silently caches instead of throwing — the current standard-model semantics', () => {
    const provider = di.usingLifetimeModel(standard())
      .configureServices(manifest =>
        manifest
          .add(SCOPED, Scoped, Type.ctor(SCOPED, [[]]), 'scoped')
          .add(SINGLETON, Singleton, Type.ctor(SINGLETON, [[SCOPED]]), 'singleton')
      )
      .withAddon(validation(standardValidationPolicy, { validateScopes: false }))
      .build();

    expect((provider.resolve(SINGLETON) as Singleton).scoped).toBe(provider.resolve(SCOPED));
  });
});

describe('validateOnBuild', () => {
  test('aggregates an unsatisfiable closed address into a ManifestValidationError thrown from build()', () => {
    expect(
      () =>
        di.usingLifetimeModel(standard())
          .configureServices(manifest => manifest.add(A, NeedsB, Type.ctor(A, [[B]]), 'singleton'))
          .withAddon(validation(standardValidationPolicy, { validateOnBuild: true }))
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
      .withAddon(validation(standardValidationPolicy, { validateOnBuild: true }))
      .build();

    expect(provider).toBeDefined();
    expect(invoked).toBe(false);
  });

  test('also catches a captive dependency, structurally, at build time', () => {
    expect(
      () =>
        di.usingLifetimeModel(standard())
          .configureServices(manifest =>
            manifest
              .add(SCOPED, Scoped, Type.ctor(SCOPED, [[]]), 'scoped')
              .add(SINGLETON, Singleton, Type.ctor(SINGLETON, [[SCOPED]]), 'singleton')
          )
          .withAddon(validation(standardValidationPolicy, { validateOnBuild: true }))
          .build(),
    ).toThrow(ManifestValidationError);
  });
});
