// Behaviour tests for `canonicalize`, the hook that swaps the instance the engine has just built,
// and for the controls around it: install order and the supply path that skips the sweep. The
// bare-hole registration at the end is the other thing the engine takes without comment — it
// resolves as a fallback provider, and only the validation addon objects. Those two run on
// `noopLifetimeAddon()` deliberately: a hole-addressed registration matches the addresses the engine
// synthesizes too, so on a model that resolves one while building — `standardLifetimeAddon()` asks for its
// `Starfish` door — the container never finishes.

import { di, noopLifetimeAddon, standardLifetimeAddon, validateUniversalAddresses } from '@rhombus-std/di';
import { type Addon, type AddonInstallation, type Behavior, Control, type Hooks, type IEngineHooks, ManifestValidationError, UniversalAddressError } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const A = Type.imported('A', 'app');
const B = Type.imported('B', 'app');
const UNREGISTERED = Type.imported('Unregistered', 'app');
const T = Type.generic('T');

class Impl {}
class Fallback {}

/** What a wrapping `canonicalize` answers in place of the instance the engine built. */
interface Wrapped {
  readonly tag: string;
  readonly inner: unknown;
}

/** The address every addon here asks through, to reach the engine's own hook control. */
const CONTROL_HOOKS = Type.from('@rhombus-std/di.core:Control<@rhombus-std/di.core:IEngineHooks>');

/** An addon whose whole contribution is one set of hooks, planted at build through the engine's hook control. */
function hooked(hooks: Behavior): Addon {
  return {
    create(): AddonInstallation {
      return {
        middleware: next => {
          const control = next(CONTROL_HOOKS) as Control<IEngineHooks>;
          control.service.useHooks(hooks);
          return next;
        },
      };
    },
  };
}

/** Hooks that swap every instance they are swept over for a `tag`-labelled wrapper around it. */
function wrapping(tag: string): Behavior {
  return { canonicalize: (_construction: Hooks.Construction, instance: unknown) => ({ tag, inner: instance }) };
}

describe('canonicalize', () => {
  test('answers in place of the instance the engine built', () => {
    const provider = di.usingLifetimeModel(noopLifetimeAddon())
      .configureServices(manifest => manifest.add(A, Impl, Type.ctor(A, [[]])))
      .useAddon(hooked(wrapping('wrapped')))
      .build();

    const answered = provider.resolve(A) as Wrapped;
    expect(answered.tag).toBe('wrapped');
    expect(answered.inner).toBeInstanceOf(Impl);
  });

  test('sweeps in install order, so the addon installed last wraps outermost', () => {
    const provider = di.usingLifetimeModel(noopLifetimeAddon())
      .configureServices(manifest => manifest.add(A, Impl, Type.ctor(A, [[]])))
      .useAddon(hooked(wrapping('inner')))
      .useAddon(hooked(wrapping('outer')))
      .build();

    const answered = provider.resolve(A) as Wrapped;
    expect(answered.tag).toBe('outer');
    expect((answered.inner as Wrapped).tag).toBe('inner');
    expect((answered.inner as Wrapped).inner).toBeInstanceOf(Impl);
  });

  test('an entry with nothing to change returns what arrived, and the sweep carries on past it', () => {
    const passthrough: Behavior = { canonicalize: (_construction: Hooks.Construction, instance: unknown) => instance };
    const provider = di.usingLifetimeModel(noopLifetimeAddon())
      .configureServices(manifest => manifest.add(A, Impl, Type.ctor(A, [[]])))
      .useAddon(hooked(wrapping('inner')))
      .useAddon(hooked(passthrough))
      .useAddon(hooked(wrapping('outer')))
      .build();

    const answered = provider.resolve(A) as Wrapped;
    expect(answered.tag).toBe('outer');
    expect((answered.inner as Wrapped).tag).toBe('inner');
  });

  test('a node another entry supplied is never swept', () => {
    const supplied = new Impl();
    let sweeps = 0;
    const counting: Behavior = {
      canonicalize: (_construction: Hooks.Construction, instance: unknown) => {
        sweeps++;
        return instance;
      },
    };

    const provider = di.usingLifetimeModel(noopLifetimeAddon())
      .configureServices(manifest => manifest.add(A, Impl, Type.ctor(A, [[]])))
      .useAddon(hooked({ beforeConstruct: () => ({ result: supplied }) }))
      .useAddon(hooked(counting))
      .build();

    expect(provider.resolve(A)).toBe(supplied);
    expect(sweeps).toBe(0);
  });

  test('a scope holding the swept instance answers the later ask with it, unswept a second time', () => {
    let sweeps = 0;
    const counting: Behavior = {
      canonicalize: (_construction: Hooks.Construction, instance: unknown) => {
        sweeps++;
        return { tag: 'once', inner: instance };
      },
    };

    const provider = di.usingLifetimeModel(standardLifetimeAddon())
      .configureServices(manifest => manifest.add(A, Impl, Type.ctor(A, [[]]), 'singleton'))
      .useAddon(hooked(counting))
      .build();

    const first = provider.resolve(A);
    expect((first as Wrapped).inner).toBeInstanceOf(Impl);
    expect(provider.resolve(A)).toBe(first);
    expect(sweeps).toBe(1);
  });

  test('an entry uninterested in a node fires nowhere on it', () => {
    const onlyA: Behavior = {
      canonicalize: (construction: Hooks.Construction, instance: unknown) => construction.populatedAddress === A ? { tag: 'wrapped', inner: instance } : instance,
    };

    const provider = di.usingLifetimeModel(noopLifetimeAddon())
      .configureServices(manifest =>
        manifest
          .add(A, Impl, Type.ctor(A, [[]]))
          .add(B, Impl, Type.ctor(B, [[]]))
      )
      .useAddon(hooked(onlyA))
      .build();

    expect((provider.resolve(A) as Wrapped).tag).toBe('wrapped');
    expect(provider.resolve(B)).toBeInstanceOf(Impl);
  });
});

describe('a registration addressed by nothing but a hole', () => {
  test('answers whatever no newer registration does, leaving the ones that do alone', () => {
    const provider = di.usingLifetimeModel(noopLifetimeAddon())
      .configureServices(manifest =>
        manifest
          .add(T, Fallback, Type.ctor(T, [[]]))
          .add(A, Impl, Type.ctor(A, [[]]))
      )
      .build();

    expect(provider.resolve(UNREGISTERED)).toBeInstanceOf(Fallback);
    expect(provider.resolve(A)).toBeInstanceOf(Impl);
  });

  test('is what validateUniversalAddresses reports, inside the build error', () => {
    let caught: unknown;
    try {
      di.usingLifetimeModel(noopLifetimeAddon())
        .configureServices(manifest => manifest.add(T, Fallback, Type.ctor(T, [[]])))
        .useAddon(validateUniversalAddresses())
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
