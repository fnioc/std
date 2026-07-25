import { ActivatorUtilities, EmptyServiceProvider, RESOLVER_TOKEN } from '@rhombus-std/di.core';
import type { IResolver, IServiceProvider } from '@rhombus-std/di.core';
import { describe, expect, test } from 'bun:test';

// Regression cover for `EmptyServiceProvider.instance` being published as the
// `IServiceProvider` INTERFACE rather than as the concrete class.
//
// Why it matters: `@rhombus-std/di.extras` DECLARATION-MERGES the tokenless
// authoring forms (`resolve<T>()`, `tryResolve<T>()`, `resolveAsync<T>()`) onto
// `IResolver`, and a class never inherits a merged interface overload. So in any
// program carrying that augmentation, the concrete `EmptyServiceProvider` type
// is NOT assignable to `IResolver` — which would make the null object unusable
// for the single thing it exists for: standing in wherever a provider is
// required. Publishing the interface keeps it drop-in either way.
//
// The COMPILE-TIME half of this regression is pinned by
// `examples/examples.lib.with-transformer`, whose `lint` typechecks with
// `@rhombus-std/di.extras` in the program and assigns the singleton to an
// `IResolver`. This suite has no such augmentation in scope, so what it pins is
// the runtime consequence: the singleton really does flow through every seam
// that asks for a provider.

/** Its only dependency is the provider itself — the intrinsic `RESOLVER_TOKEN` slot. */
class NeedsOnlyTheProvider {
  public constructor(public readonly resolver: IResolver) {}
}

/** A caller-supplied dependency that is never a registration anywhere. */
class Payload {
  public constructor(public readonly text: string) {}
}

/** Mixes a container-owned slot with a caller-supplied one. */
class Handler {
  public constructor(
    public readonly resolver: IResolver,
    public readonly payload: Payload,
  ) {}
}

const PAYLOAD_TOKEN = 'pkg:Payload';

describe('EmptyServiceProvider as an IResolver seam', () => {
  test('the singleton is typed as the provider interface, not the impl class', () => {
    // The annotation is the point: it is what breaks if `instance` ever regains
    // its concrete class type in a transformer-enabled program.
    const seam: IServiceProvider<string> = EmptyServiceProvider.instance;
    expect(seam).toBe(EmptyServiceProvider.instance);
  });

  test('activates a class whose only dependency is the provider', () => {
    const instance = ActivatorUtilities.createInstance(
      EmptyServiceProvider.instance,
      NeedsOnlyTheProvider,
      [RESOLVER_TOKEN],
    ) as NeedsOnlyTheProvider;

    expect(instance).toBeInstanceOf(NeedsOnlyTheProvider);
    // The intrinsic provider slot is the one token the empty provider satisfies,
    // and it resolves to the empty provider itself.
    expect(instance.resolver).toBe(EmptyServiceProvider.instance);
  });

  test('serves as a test double: unregistered slots fall through to supplied arguments', () => {
    const build = ActivatorUtilities.createFactory<Handler>(Handler, [RESOLVER_TOKEN, PAYLOAD_TOKEN]);
    const handler = build(EmptyServiceProvider.instance, [new Payload('hello')]);

    expect(handler.resolver).toBe(EmptyServiceProvider.instance);
    expect(handler.payload.text).toBe('hello');
  });

  test('getServiceOrCreateInstance falls back to activation on the empty provider', () => {
    const built = ActivatorUtilities.getServiceOrCreateInstance(
      EmptyServiceProvider.instance,
      PAYLOAD_TOKEN,
      class {
        public readonly text = 'default';
      },
    ) as { text: string; };

    expect(built.text).toBe('default');
  });
});
