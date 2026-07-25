import { EmptyServiceProvider, RESOLVER_TOKEN } from '@rhombus-std/di.core';
import type { IResolver, IServiceProvider } from '@rhombus-std/di.core';
import { describe, expect, test } from 'bun:test';

// The COMPILE-TIME half of the `EmptyServiceProvider.instance` regression.
//
// `@rhombus-std/di.extras` declaration-merges the tokenless authoring forms
// (`resolve<T>()`, `tryResolve<T>()`, `resolveAsync<T>()`) onto the `IResolver`
// INTERFACE. A class never inherits a merged interface overload, so if
// `instance` were published as the concrete `EmptyServiceProvider` class it
// would stop being assignable to `IResolver` the moment the augmentation is in
// scope — TS2322, "target signature provides too few arguments" — and the null
// object would be unusable for the one thing it exists for.
//
// That failure is INVISIBLE to every other di test package, because none of them
// has the augmentation in their program. This one does (see tsconfig's `types`),
// which is the whole reason the package exists. The assignments below are the
// assertion; `bun test` only keeps them honest at runtime, `bun run lint`
// (tsc --noEmit) is what actually checks them.

describe('EmptyServiceProvider.instance under the di.extras augmentation', () => {
  test('assigns to IResolver — the interface the tokenless forms merge onto', () => {
    // If `instance` regains its concrete class type, THIS LINE stops compiling.
    const nowhere: IResolver = EmptyServiceProvider.instance;

    expect(nowhere.isService(RESOLVER_TOKEN)).toBe(true);
  });

  test('assigns to IServiceProvider — the full surface including scope and disposal', () => {
    const provider: IServiceProvider<string> = EmptyServiceProvider.instance;

    expect(provider.createScope()).toBe(EmptyServiceProvider.instance);
  });

  test('the merged tokenless overloads are reachable through the assigned value', () => {
    const nowhere: IResolver = EmptyServiceProvider.instance;

    // The zero-argument form only exists because of the augmentation: without it
    // this call is an arity error rather than a token-derivation site. The
    // derived token is unregistered on the empty provider, so the honest answer
    // is `undefined` — the value is not the point, the fact that it COMPILES is.
    interface INothingRegistered {
      readonly marker: 'nothing';
    }

    expect(nowhere.tryResolve<INothingRegistered>()).toBeUndefined();
  });
});
