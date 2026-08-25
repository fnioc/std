// Behaviour tests for `di.usingLifetimeModel(...)`, the container-builder front door. It composes
// manifest and provider-option steps in call order, and every step is a pure delegate over an
// immutable value — so what a discarded return registers, and what a later `usingManifest` or an
// intermediate `build()` sees, are the properties worth pinning down.

import { ContainerBuilder, di } from '@rhombus-std/di';
import { LifetimeModel, Manifest, ManifestValidationError, type Realizer, ServiceDescriptor, UnsatisfiableError } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const A = Type.imported('A', 'app');
const B = Type.imported('B', 'app');
const MARKER = Type.imported('Marker', 'app');
const SCOPE_FACTORY = Type.imported('ScopeFactory', '@rhombus-std/di.core', []);

class Impl {}
class NeedsB {}

/** Stateless, so every model instance shares the one realizer — same shape as {@link LifetimeModel.noop}. */
const markerFloorRealizer: Realizer<unknown> = {
  realize: ({ make }) => make(markerFloorRealizer),
};

/** A lifetime model whose floor registers one marker value, otherwise behaving exactly like {@link LifetimeModel.noop}. */
const withMarkerFloor: LifetimeModel<unknown> = {
  name: 'marker-floor',
  addModelServices() {
    return [ServiceDescriptor.value(MARKER, 'from-model')];
  },
  createRealizer() {
    return { realizer: markerFloorRealizer };
  },
};

describe('a single configureServices step', () => {
  test('resolves the value it registered', () => {
    const provider = di.usingLifetimeModel(LifetimeModel.noop)
      .configureServices(manifest => manifest.addValue(A, 'a'))
      .build();
    expect(provider.resolve(A)).toBe('a');
  });
});

describe('multiple configureServices steps', () => {
  test("compose in call order, each seeing the previous step's manifest", () => {
    const provider = di.usingLifetimeModel(LifetimeModel.noop)
      .configureServices(manifest => manifest.addValue(A, 'a'))
      .configureServices(manifest => manifest.addValue(B, 'b'))
      .build();
    expect(provider.resolve(A)).toBe('a');
    expect(provider.resolve(B)).toBe('b');
  });

  test('a step that discards the manifest it registered onto registers nothing', () => {
    const provider = di.usingLifetimeModel(LifetimeModel.noop)
      .configureServices(manifest => {
        manifest.addValue(A, 'a');
        return manifest;
      })
      .build();
    expect(() => provider.resolve(A)).toThrow(UnsatisfiableError);
  });
});

describe('usingManifest', () => {
  test('seeds the builder from an existing descriptor stream', () => {
    const seed = Manifest.empty<unknown>().addValue(A, 'seeded');
    const provider = di.usingLifetimeModel(LifetimeModel.noop).usingManifest(seed).build();
    expect(provider.resolve(A)).toBe('seeded');
  });

  test('discards configureServices steps configured before it, keeping steps configured after', () => {
    const seed = Manifest.empty<unknown>().addValue(A, 'seeded');
    const provider = di.usingLifetimeModel(LifetimeModel.noop)
      .configureServices(manifest => manifest.addValue(A, 'discarded'))
      .usingManifest(seed)
      .configureServices(manifest => manifest.addValue(B, 'kept-after'))
      .build();
    expect(provider.resolve(A)).toBe('seeded');
    expect(provider.resolve(B)).toBe('kept-after');
  });

  test('round-trips iteration order: a newer registration still wins over an older one', () => {
    const seed = Manifest.empty<unknown>()
      .addValue(A, 'older')
      .addValue(A, 'newer');
    const provider = di.usingLifetimeModel(LifetimeModel.noop).usingManifest(seed).build();
    expect(provider.resolve(A)).toBe('newer');
  });
});

describe('builder immutability', () => {
  test("an intermediate builder's build() excludes steps derived from it later", () => {
    const intermediate = di.usingLifetimeModel(LifetimeModel.noop)
      .configureServices(manifest => manifest.addValue(A, 'a'));
    const _later: ContainerBuilder<unknown> = intermediate.configureServices(manifest => manifest.addValue(B, 'b'));

    const provider = intermediate.build();
    expect(provider.resolve(A)).toBe('a');
    expect(() => provider.resolve(B)).toThrow(UnsatisfiableError);
  });
});

describe('configureProvider', () => {
  test('composes provider options in call order', () => {
    expect(
      () =>
        di.usingLifetimeModel(LifetimeModel.noop)
          .configureServices(manifest => manifest.add(A, NeedsB, Type.ctor(A, [[B]])))
          .configureProvider(options => ({ ...options, validateOnBuild: false }))
          .configureProvider(options => ({ ...options, validateOnBuild: true }))
          .build(),
    ).toThrow(ManifestValidationError);
  });

  test('without configureProvider, an unsatisfiable graph builds fine — the failure surfaces on resolution', () => {
    const provider = di.usingLifetimeModel(LifetimeModel.noop)
      .configureServices(manifest => manifest.add(A, NeedsB, Type.ctor(A, [[B]])))
      .build();
    expect(provider).toBeDefined();
  });

  test('validateOnBuild does not throw when every closed address is satisfiable', () => {
    const provider = di.usingLifetimeModel(LifetimeModel.noop)
      .configureServices(manifest => manifest.add(A, Impl, Type.ctor(A, [[]])))
      .configureProvider(options => ({ ...options, validateOnBuild: true }))
      .build();
    expect(provider.resolve(A)).toBeInstanceOf(Impl);
  });
});

describe('the model floor', () => {
  test('a plain build() resolves the services the model registers for itself', () => {
    const provider = di.usingLifetimeModel(withMarkerFloor).build();
    expect(provider.resolve(MARKER)).toBe('from-model');
  });

  test('usingManifest layers over the floor rather than replacing it', () => {
    const seed = Manifest.empty<unknown>().addValue(A, 'seeded');
    const provider = di.usingLifetimeModel(withMarkerFloor).usingManifest(seed).build();
    expect(provider.resolve(A)).toBe('seeded');
    expect(provider.resolve(MARKER)).toBe('from-model');
  });

  test("a user registration of the same service type outranks the model's", () => {
    const provider = di.usingLifetimeModel(withMarkerFloor)
      .configureServices(manifest => manifest.addValue(MARKER, 'from-user'))
      .build();
    expect(provider.resolve(MARKER)).toBe('from-user');
  });
});

describe('the ScopeFactory address', () => {
  test('is unsatisfiable when the model publishes no factory', () => {
    const provider = di.usingLifetimeModel(LifetimeModel.noop).build();
    expect(() => provider.resolve(SCOPE_FACTORY)).toThrow(UnsatisfiableError);
  });

  test('hands back the registered factory, which forwards the lifetime argument', () => {
    const scope = di.usingLifetimeModel(LifetimeModel.noop).build();
    let forwarded: unknown[] = [];
    const provider = di.usingLifetimeModel(LifetimeModel.noop)
      .configureServices(manifest =>
        manifest.addValue(SCOPE_FACTORY, (...args: unknown[]) => {
          forwarded = args;
          return scope;
        })
      )
      .build();

    expect(provider.resolve(SCOPE_FACTORY)('x')).toBe(scope);
    expect(forwarded).toEqual(['x']);
  });
});
