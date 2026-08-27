// Behaviour tests for `canonicalize`, the hook that swaps the instance the engine has just built,
// and for the controls around it: install order, the `interested` predicate, and the supply path
// that skips the sweep. The bare-hole registration at the end is the other thing the engine takes
// without comment — it resolves as a fallback provider, and only the validation addon objects.
// Those two run on `noop()` deliberately: a hole-addressed registration matches the addresses the
// engine synthesizes too, so on a model that resolves one while building — `standard()` asks for
// its `Starfish` door — the container never finishes.

import { di, noop, standard, validation } from '@rhombus-std/di';
import { type ChainAddon, type Hooks, type LifetimePolicy, ManifestValidationError, UniversalAddressError } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const A = Type.imported('A', 'app');
const B = Type.imported('B', 'app');
const UNREGISTERED = Type.imported('Unregistered', 'app');
const T = Type.generic('T');

class Impl {}
class Fallback {}

/** `noop()` carries no lifetime vocabulary, so a policy for it classifies nothing. */
const noopPolicy: LifetimePolicy = { classify: () => undefined };

/** What a wrapping `canonicalize` answers in place of the instance the engine built. */
interface Wrapped {
  readonly tag: string;
  readonly inner: unknown;
}

/** An addon whose whole contribution is one hooks object. */
function hooked<Lifetime>(hooks: Hooks): ChainAddon<Lifetime> {
  return { install: () => ({ hooks }) };
}

/** Hooks that swap every instance they are swept over for a `tag`-labelled wrapper around it. */
function wrapping(tag: string): Hooks {
  return { canonicalize: (_construction, instance) => ({ tag, inner: instance }) };
}

describe('canonicalize', () => {
  test('answers in place of the instance the engine built', () => {
    const provider = di.usingLifetimeModel(noop())
      .configureServices(manifest => manifest.add(A, Impl, Type.ctor(A, [[]])))
      .withAddon(hooked(wrapping('wrapped')))
      .build();

    const answered = provider.resolve(A) as Wrapped;
    expect(answered.tag).toBe('wrapped');
    expect(answered.inner).toBeInstanceOf(Impl);
  });

  test('sweeps in install order, so the addon installed last wraps outermost', () => {
    const provider = di.usingLifetimeModel(noop())
      .configureServices(manifest => manifest.add(A, Impl, Type.ctor(A, [[]])))
      .withAddon(hooked(wrapping('inner')))
      .withAddon(hooked(wrapping('outer')))
      .build();

    const answered = provider.resolve(A) as Wrapped;
    expect(answered.tag).toBe('outer');
    expect((answered.inner as Wrapped).tag).toBe('inner');
    expect((answered.inner as Wrapped).inner).toBeInstanceOf(Impl);
  });

  test('an entry with nothing to change returns what arrived, and the sweep carries on past it', () => {
    const passthrough: Hooks = { canonicalize: (_construction, instance) => instance };
    const provider = di.usingLifetimeModel(noop())
      .configureServices(manifest => manifest.add(A, Impl, Type.ctor(A, [[]])))
      .withAddon(hooked(wrapping('inner')))
      .withAddon(hooked(passthrough))
      .withAddon(hooked(wrapping('outer')))
      .build();

    const answered = provider.resolve(A) as Wrapped;
    expect(answered.tag).toBe('outer');
    expect((answered.inner as Wrapped).tag).toBe('inner');
  });

  test('a node another entry supplied is never swept', () => {
    const supplied = new Impl();
    let sweeps = 0;
    const counting: Hooks = {
      canonicalize: (_construction, instance) => {
        sweeps++;
        return instance;
      },
    };

    const provider = di.usingLifetimeModel(noop())
      .configureServices(manifest => manifest.add(A, Impl, Type.ctor(A, [[]])))
      .withAddon(hooked<unknown>({ beforeConstruct: () => ({ instance: supplied }) }))
      .withAddon(hooked(counting))
      .build();

    expect(provider.resolve(A)).toBe(supplied);
    expect(sweeps).toBe(0);
  });

  test('a scope holding the swept instance answers the later ask with it, unswept a second time', () => {
    let sweeps = 0;
    const counting: Hooks = {
      canonicalize: (_construction, instance) => {
        sweeps++;
        return { tag: 'once', inner: instance };
      },
    };

    const provider = di.usingLifetimeModel(standard())
      .configureServices(manifest => manifest.add(A, Impl, Type.ctor(A, [[]]), 'singleton'))
      .withAddon(hooked(counting))
      .build();

    const first = provider.resolve(A);
    expect((first as Wrapped).inner).toBeInstanceOf(Impl);
    expect(provider.resolve(A)).toBe(first);
    expect(sweeps).toBe(1);
  });

  test('an entry uninterested in a node fires nowhere on it', () => {
    const onlyA: Hooks = {
      interested: (_registration, address) => address === A,
      ...wrapping('wrapped'),
    };

    const provider = di.usingLifetimeModel(noop())
      .configureServices(manifest =>
        manifest
          .add(A, Impl, Type.ctor(A, [[]]))
          .add(B, Impl, Type.ctor(B, [[]]))
      )
      .withAddon(hooked(onlyA))
      .build();

    expect((provider.resolve(A) as Wrapped).tag).toBe('wrapped');
    expect(provider.resolve(B)).toBeInstanceOf(Impl);
  });
});

describe('a registration addressed by nothing but a hole', () => {
  test('answers whatever no newer registration does, leaving the ones that do alone', () => {
    const provider = di.usingLifetimeModel(noop())
      .configureServices(manifest =>
        manifest
          .add(T, Fallback, Type.ctor(T, [[]]))
          .add(A, Impl, Type.ctor(A, [[]]))
      )
      .build();

    expect(provider.resolve(UNREGISTERED)).toBeInstanceOf(Fallback);
    expect(provider.resolve(A)).toBeInstanceOf(Impl);
  });

  test('is what the validation addon reports, inside the build error', () => {
    let caught: unknown;
    try {
      di.usingLifetimeModel(noop())
        .configureServices(manifest => manifest.add(T, Fallback, Type.ctor(T, [[]])))
        .withAddon(validation(noopPolicy, { validateOnBuild: true }))
        .build();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ManifestValidationError);
    const universal = (caught as ManifestValidationError).errors.find(error => error instanceof UniversalAddressError);
    expect(universal).toBeInstanceOf(UniversalAddressError);
    expect((universal as UniversalAddressError).address).toBe(T);
  });
});
