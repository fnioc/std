// `EmptyServiceProvider` — a shared null-object `IServiceProvider` that contains no
// application services. Mirrors the reference DI `EmptyServiceProvider`
// (DependencyInjection.Abstractions/src): a lightweight singleton to hand where a
// provider is required but none is available, instead of standing up a real
// (empty) container or writing a bespoke stub.
//
// It lives in di.core (not `@rhombus-std/di`) for the same reason the reference
// puts it in the abstractions package: it is a hand-written implementation of the
// PUBLIC `IServiceProvider` surface (§27's `IResolver` capabilities plus scope /
// disposal), with no resolution engine behind it. Placed beside `provider.ts`,
// whose capability interfaces it satisfies.
//
// Behavior — everything is empty except the ONE intrinsic std built-in, the
// provider itself:
//   - the intrinsic provider token (a `IResolver`-typed dependency) resolves to
//     THIS provider — the reference likewise returns itself for `IServiceProvider`
//     / `IServiceProviderIsService`. `isService` reports true for it alone;
//   - every other token is unregistered: `tryResolve` → `undefined`, `resolve` /
//     `resolveAsync` throw, `resolveFactory` throws (no target to build);
//   - the keyed PLURAL forms (`resolve(token, /…/)`) return `[]`. Their contract
//     is "0 matches yields `[]` — never throws on count", and a provider with no
//     registrations has an empty key-space for every token, so the empty scan IS
//     the honest answer. This is NOT the empty-collection divergence below: that
//     one is about the `Array<T>` wrapper grammar, which di.core does not own;
//     the keyed key-space is a plain property of having no registrations;
//   - `createScope` returns this same empty provider (the reference's empty scope
//     returns itself); `dispose` / `disposeAsync` are no-ops.
//
// DIVERGENCE — the reference resolves `IEnumerable<T>` to an empty sequence. std's
// collection tokens (`Array<T>` / `Iterable<T>`) and their empty-aggregate
// behavior are owned by the resolution engine (`@rhombus-std/di`), which is the
// single source of that convention; reproducing it here would fork the wrapper-
// base knowledge into di.core. A null object that has no registrations returning
// "unregistered" for a collection token is the honest behavior, so the
// empty-collection case is intentionally not mirrored.

import { DiError } from './errors.js';
import { isProviderToken } from './provider-token.js';
import type { IServiceProvider } from './provider.js';
import type { Token } from './types.js';

/** The error a miss on the empty provider raises — every token is unregistered. */
function unregistered(token: Token): DiError {
  return new DiError(
    `No service registered for token "${token}": this is the EmptyServiceProvider, `
      + `which contains no application services.`,
  );
}

/**
 * A `IServiceProvider` with no application services. Use the shared `instance`
 * singleton rather than constructing one — every instance is behaviorally
 * identical and stateless.
 */
export class EmptyServiceProvider implements IServiceProvider<string> {
  /** The shared empty-provider singleton (the reference `Instance`). */
  public static readonly instance: EmptyServiceProvider = new EmptyServiceProvider();

  private constructor() {}

  /** The empty provider is frameless — it has no open scope, so no name. */
  public get name(): string {
    throw new TypeError('The EmptyServiceProvider has no scope frame open.');
  }

  public resolve<T>(token: Token, pattern: RegExp): T[];
  public resolve(token: Token, pattern: RegExp): unknown[];
  public resolve<T>(token: Token, key?: string): T;
  public resolve(token: Token, key?: string): unknown;
  public resolve(token: Token, key?: string | RegExp): unknown {
    // Keyed PLURAL: the contract is "0 matches yields `[]` — never throws on
    // count" (`IRequiredResolver`). The empty provider has no key-space at all,
    // so every pattern scan is the empty one. The intrinsic provider is NOT in
    // it: a keyed scan is confined to `token`'s own key-space, and the provider
    // token has none.
    if (key instanceof RegExp) {
      return [];
    }
    // Keyed SINGULAR: a key composes an ORDINARY token, and every token but the
    // intrinsic provider is unregistered here — so a keyed request misses even
    // when its base is the provider token.
    if (isProviderToken(token) && !key) {
      return this;
    }
    throw unregistered(token);
  }

  public resolveAsync<T>(token: Token): Promise<T>;
  public resolveAsync(token: Token): Promise<unknown>;
  public async resolveAsync(token: Token): Promise<unknown> {
    return this.resolve(token);
  }

  public tryResolve<T>(token: Token, pattern: RegExp): T[];
  public tryResolve(token: Token, pattern: RegExp): unknown[];
  public tryResolve<T>(token: Token, key?: string): T | undefined;
  public tryResolve(token: Token, key?: string): unknown;
  public tryResolve(token: Token, key?: string | RegExp): unknown {
    if (key instanceof RegExp) {
      return [];
    }
    return isProviderToken(token) && !key ? this : undefined;
  }

  public isService(token: Token): boolean {
    return isProviderToken(token);
  }

  public resolveFactory<F>(type: Token, params?: readonly Token[]): F;
  public resolveFactory(type: Token, params?: readonly Token[]): unknown;
  public resolveFactory(type: Token, _params?: readonly Token[]): unknown {
    throw unregistered(type);
  }

  public createScope(_name?: string): IServiceProvider<string> {
    // The empty provider is its own scope — the reference's empty scope factory
    // returns itself. A name may be passed but is irrelevant: an empty provider
    // caches nothing, so every frame is equivalent.
    return this;
  }

  public dispose(): void {}

  public async disposeAsync(): Promise<void> {}

  public [Symbol.dispose](): void {}

  public async [Symbol.asyncDispose](): Promise<void> {}
}
