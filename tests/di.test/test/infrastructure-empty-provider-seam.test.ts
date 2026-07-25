import { DiError, EmptyServiceProvider, RESOLVER_TOKEN } from '@rhombus-std/di.core';
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
// The COMPILE-TIME half of that regression cannot be pinned from THIS program,
// which has no augmentation in scope — it lives in
// `tests/di.extras.test/test/empty-provider-augmented-assignment.test.ts`,
// whose `lint` typechecks with `@rhombus-std/di.extras` pulled in. What this
// suite pins is the runtime consequence: the singleton really does behave as the
// interface says wherever a provider is asked for.

/** Its only dependency is the provider itself — the intrinsic `RESOLVER_TOKEN` slot. */
class NeedsOnlyTheProvider {
  public constructor(public readonly resolver: IResolver) {}
}

const ORDINARY_TOKEN = 'pkg:IOrdinary';

describe('EmptyServiceProvider as an IResolver seam', () => {
  test('the singleton is typed as the provider interface, not the impl class', () => {
    // The annotation is the point: it is what breaks if `instance` ever regains
    // its concrete class type in a transformer-enabled program.
    const seam: IServiceProvider<string> = EmptyServiceProvider.instance;
    expect(seam).toBe(EmptyServiceProvider.instance);
  });

  test('the intrinsic provider slot is the one token it satisfies', () => {
    const nowhere: IResolver = EmptyServiceProvider.instance;

    expect(nowhere.isService(RESOLVER_TOKEN)).toBe(true);
    expect(nowhere.resolve(RESOLVER_TOKEN)).toBe(EmptyServiceProvider.instance);

    // So a class whose only dependency is the provider is constructible against
    // it by hand — the null object standing in for a real container.
    const instance = new NeedsOnlyTheProvider(nowhere.resolve<IResolver>(RESOLVER_TOKEN));
    expect(instance.resolver).toBe(EmptyServiceProvider.instance);
  });

  test('every other token is a miss: tryResolve is undefined, resolve throws a DiError', () => {
    const nowhere: IResolver = EmptyServiceProvider.instance;

    expect(nowhere.isService(ORDINARY_TOKEN)).toBe(false);
    expect(nowhere.tryResolve(ORDINARY_TOKEN)).toBeUndefined();
    expect(() => nowhere.resolve(ORDINARY_TOKEN)).toThrow(DiError);
  });

  test('resolveFactory throws too — there is no registration to build from', () => {
    const nowhere: IResolver = EmptyServiceProvider.instance;

    expect(() => nowhere.resolveFactory(ORDINARY_TOKEN)).toThrow(DiError);
    expect(() => nowhere.resolveFactory(ORDINARY_TOKEN, ['pkg:IArg'])).toThrow(DiError);
  });

  test('resolveAsync surfaces the same miss through a rejection', async () => {
    const nowhere: IResolver = EmptyServiceProvider.instance;

    await expect(nowhere.resolveAsync(ORDINARY_TOKEN)).rejects.toThrow(DiError);
    await expect(nowhere.resolveAsync(RESOLVER_TOKEN)).resolves.toBe(EmptyServiceProvider.instance);
  });
});
