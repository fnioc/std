// Behaviour tests for the validation middleware, addons, and the standard model's captivity
// sweep: `validateStandardCaptivity` walks every buildable address for captive pairs, and
// `validateBuildability` plans every closed address up front — both run their sweep at
// `build()`, so a broken manifest never produces a provider.

import { di, standard, StandardScopeFactory, validateBuildability, validateStandardCaptivity } from '@rhombus-std/di';
import { CaptiveDependencyError, type IServiceProvider, LifetimeModelError, ManifestValidationError } from '@rhombus-std/di.core';
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

describe('standard model captivity validation', () => {
  test('standard() catches a captive dependency at build time by default', () => {
    let caught: unknown;
    try {
      di.usingLifetimeModel(standard())
        .configureServices(manifest =>
          manifest
            .add(SCOPED, Scoped, Type.ctor(SCOPED, [[]]), 'scoped')
            .add(SINGLETON, Singleton, Type.ctor(SINGLETON, [[SCOPED]]), 'singleton')
            .add(TRANSIENT, Transient, Type.ctor(TRANSIENT, [[SINGLETON]]), 'transient')
        )
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

  test('validateOnBuild off omits the captivity validator', () => {
    expect(() =>
      di.usingLifetimeModel(standard({ validateOnBuild: false }))
        .configureServices(manifest =>
          manifest
            .add(SCOPED, Scoped, Type.ctor(SCOPED, [[]]), 'scoped')
            .add(SINGLETON, Singleton, Type.ctor(SINGLETON, [[SCOPED]]), 'singleton')
        )
        .build()
    ).not.toThrow();
  });

  test('the standalone middleware catches a captive dependency when composed manually', () => {
    expect(() =>
      di.usingLifetimeModel(standard({ validateOnBuild: false }))
        .configureServices(manifest =>
          manifest
            .add(SCOPED, Scoped, Type.ctor(SCOPED, [[]]), 'scoped')
            .add(SINGLETON, Singleton, Type.ctor(SINGLETON, [[SCOPED]]), 'singleton')
        )
        .use(validateStandardCaptivity())
        .build()
    ).toThrow(ManifestValidationError);
  });

  test('a scoped registration resolved from an opened scope succeeds', () => {
    const provider = di.usingLifetimeModel(standard())
      .configureServices(manifest => manifest.add(SCOPED, Scoped, Type.ctor(SCOPED, [[]]), 'scoped'))
      .build();

    expect(openScope(provider).resolve(SCOPED)).toBeInstanceOf(Scoped);
  });

  test('validateScopes off permits a scoped registration at the root scope — root keeps the instance', () => {
    const provider = di.usingLifetimeModel(standard({ validateScopes: false }))
      .configureServices(manifest => manifest.add(SCOPED, Scoped, Type.ctor(SCOPED, [[]]), 'scoped'))
      .build();

    const instance = provider.resolve(SCOPED);
    expect(instance).toBeInstanceOf(Scoped);
    // Root keeps it: same instance on every ask.
    expect(provider.resolve(SCOPED)).toBe(instance);
  });

  test('the validator and selectOwningScope agree on a keep-only lifetime', () => {
    // { keep: 'singleton' } without a `release` member is not a valid StandardLifetime: the
    // validator must classify it the same way selectOwningScope reads it (no lifetime), so the
    // build succeeds and a resolve of the singleton hits the "named none" guard — never the
    // captive-pair path.
    const KEEP_ONLY = Type.imported('KeepOnly', 'app');
    class KeepOnly {}

    const provider = di.usingLifetimeModel(standard())
      .configureServices(manifest => manifest.add(KEEP_ONLY, KeepOnly, Type.ctor(KEEP_ONLY, [[]]), { keep: 'singleton' } as never))
      .build();

    let caught: unknown;
    try {
      provider.resolve(KEEP_ONLY);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(LifetimeModelError);
    expect(((caught as LifetimeModelError).cause as Error).message).toContain('named none');
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
    const provider = di.usingLifetimeModel(standard({ validateOnBuild: false }))
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
