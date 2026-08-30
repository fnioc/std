// Behaviour tests for `di.usingLifetimeModel(...)`, the container-builder front door. It composes
// manifest steps and addons in call/install order, and every step is a pure delegate over an
// immutable value — so what a discarded return registers, and what a later `usingManifest` or an
// intermediate `build()` sees, are the properties worth pinning down.

import { type ContainerBuilder, di, noop, StandardScopeFactory, validateBuildability } from '@rhombus-std/di';
import { type Addon, Manifest, ManifestValidationError, UnsatisfiableError } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const A = Type.imported('A', 'app');
const B = Type.imported('B', 'app');

class Impl {}
class NeedsB {}

describe('a single configureServices step', () => {
  test('resolves the value it registered', () => {
    const provider = di.usingLifetimeModel(noop())
      .configureServices(manifest => manifest.addValue(A, 'a'))
      .build();
    expect(provider.resolve(A)).toBe('a');
  });
});

describe('multiple configureServices steps', () => {
  test("compose in call order, each seeing the previous step's manifest", () => {
    const provider = di.usingLifetimeModel(noop())
      .configureServices(manifest => manifest.addValue(A, 'a'))
      .configureServices(manifest => manifest.addValue(B, 'b'))
      .build();
    expect(provider.resolve(A)).toBe('a');
    expect(provider.resolve(B)).toBe('b');
  });

  test('a step that discards the manifest it registered onto registers nothing', () => {
    const provider = di.usingLifetimeModel(noop())
      .configureServices(manifest => {
        manifest.addValue(A, 'a');
        return manifest;
      })
      .build();
    expect(() => provider.resolve(A)).toThrow(UnsatisfiableError);
  });
});

describe('usingManifest', () => {
  test('seeds the builder from an existing registration stream', () => {
    const seed = Manifest.empty<unknown>().addValue(A, 'seeded');
    const provider = di.usingLifetimeModel(noop()).usingManifest(seed).build();
    expect(provider.resolve(A)).toBe('seeded');
  });

  test('discards configureServices steps configured before it, keeping steps configured after', () => {
    const seed = Manifest.empty<unknown>().addValue(A, 'seeded');
    const provider = di.usingLifetimeModel(noop())
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
    const provider = di.usingLifetimeModel(noop()).usingManifest(seed).build();
    expect(provider.resolve(A)).toBe('newer');
  });
});

describe('builder immutability', () => {
  test("an intermediate builder's build() excludes steps derived from it later", () => {
    const intermediate = di.usingLifetimeModel(noop())
      .configureServices(manifest => manifest.addValue(A, 'a'));
    const _later: ContainerBuilder<unknown> = intermediate.configureServices(manifest => manifest.addValue(B, 'b'));

    const provider = intermediate.build();
    expect(provider.resolve(A)).toBe('a');
    expect(() => provider.resolve(B)).toThrow(UnsatisfiableError);
  });
});

describe('useAddon', () => {
  test('installs addons in call order, each one contributing at build', () => {
    const order: string[] = [];
    const first: Addon = { create: () => {
      order.push('first');
      return {};
    } };
    const second: Addon = { create: () => {
      order.push('second');
      return {};
    } };

    di.usingLifetimeModel(noop())
      .useAddon(first)
      .useAddon(second)
      .build();

    expect(order).toEqual(['first', 'second']);
  });
});

describe('the validateBuildability addon', () => {
  test('throws ManifestValidationError when a closed address is unsatisfiable', () => {
    expect(
      () =>
        di.usingLifetimeModel(noop())
          .configureServices(manifest => manifest.add(A, NeedsB, Type.ctor(A, [[B]])))
          .useAddon(validateBuildability())
          .build(),
    ).toThrow(ManifestValidationError);
  });

  test('without the addon, an unsatisfiable graph builds fine — the failure surfaces on resolution', () => {
    const provider = di.usingLifetimeModel(noop())
      .configureServices(manifest => manifest.add(A, NeedsB, Type.ctor(A, [[B]])))
      .build();
    expect(provider).toBeDefined();
  });

  test('does not throw when every closed address is satisfiable', () => {
    const provider = di.usingLifetimeModel(noop())
      .configureServices(manifest => manifest.add(A, Impl, Type.ctor(A, [[]])))
      .useAddon(validateBuildability())
      .build();
    expect(provider.resolve(A)).toBeInstanceOf(Impl);
  });
});

describe("a model's scope-opening address", () => {
  test('is unsatisfiable when the model publishes no factory', () => {
    const provider = di.usingLifetimeModel(noop()).build();
    expect(() => provider.resolve(StandardScopeFactory.address)).toThrow(UnsatisfiableError);
  });

  test('is a registration like any other, so a container can answer it itself', () => {
    const scope = di.usingLifetimeModel(noop()).build();
    const provider = di.usingLifetimeModel(noop())
      .configureServices(manifest => manifest.addValue(StandardScopeFactory.address, { openScope: () => scope }))
      .build();

    expect((provider.resolve(StandardScopeFactory.address) as StandardScopeFactory).openScope()).toBe(scope);
  });
});
