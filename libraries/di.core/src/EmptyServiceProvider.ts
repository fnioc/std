// A null-object `IServiceProvider` holding no application services — to hand
// where a provider is required but none is available, instead of standing up a
// real (empty) container or writing a bespoke stub. It implements the public
// provider surface by hand; there is no resolution engine behind it.
//
// Everything is empty except the ONE intrinsic built-in, the provider itself:
//   - the intrinsic provider token resolves to THIS provider, and `isService`
//     reports true for it alone;
//   - every other token is unregistered: `tryResolve` → `undefined`, `resolve` /
//     `resolveAsync` throw, `resolveFactory` throws (no target to build);
//   - the keyed PLURAL forms (`resolve(token, /…/)`) return `[]` — their contract
//     is "0 matches yields `[]`, never throws on count", and a provider with no
//     registrations has an empty key-space for every token;
//   - `createScope` returns this same empty provider; `dispose` / `disposeAsync`
//     are no-ops.
//
// A collection token (`Array<T>` / `Iterable<T>`) is deliberately NOT special-cased
// to an empty aggregate: that wrapper grammar belongs to the resolution engine
// (`@rhombus-std/di`), and answering it here would fork the knowledge. With no
// registrations at all, "unregistered" is the honest answer.

import { DiError } from './errors.js';
import { isProviderToken } from './provider-token.js';
import type { IServiceProvider } from './provider.js';
import type { Token } from './types.js';

function unregistered(token: Token): DiError {
  return new DiError(
    `No service registered for token "${token}": this is the EmptyServiceProvider, `
      + `which contains no application services.`,
  );
}

/** A `IServiceProvider` with no application services. Reached via `instance`. */
export class EmptyServiceProvider implements IServiceProvider<string> {
  /**
   * The shared empty-provider singleton.
   *
   * Typed as the INTERFACE, not as this class, and that is load-bearing rather
   * than stylistic: a downstream package can DECLARATION-MERGE further `resolve`
   * / `tryResolve` / `resolveAsync` overloads onto `IResolver`, and a class never
   * picks up a merged interface overload — so in such a program the concrete
   * `EmptyServiceProvider` type is not assignable to `IResolver` ("target
   * signature provides too few arguments"), which would make the singleton
   * unusable for the one thing it exists for.
   */
  public static readonly instance: IServiceProvider<string> = new EmptyServiceProvider();

  private constructor() {}

  public get name(): string {
    throw new TypeError('The EmptyServiceProvider has no scope frame open.');
  }

  public resolve<T>(token: Token, pattern: RegExp): T[];
  public resolve(token: Token, pattern: RegExp): unknown[];
  public resolve<T>(token: Token, key?: string): T;
  public resolve(token: Token, key?: string): unknown;
  public resolve(token: Token, key?: string | RegExp): unknown {
    // Keyed PLURAL: "0 matches yields `[]`, never throws on count". The intrinsic
    // provider is NOT in the result — a keyed scan is confined to `token`'s own
    // key-space, and the provider token has none.
    if (key instanceof RegExp) {
      return [];
    }
    // Keyed SINGULAR: a key composes an ORDINARY token, and every token but the
    // bare intrinsic provider is unregistered here — so a keyed request misses
    // even when its base is the provider token.
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
    // The empty provider is its own scope. A name may be passed but is
    // irrelevant: nothing is ever cached, so every frame is equivalent.
    return this;
  }

  public dispose(): void {}

  public async disposeAsync(): Promise<void> {}

  public [Symbol.dispose](): void {}

  public async [Symbol.asyncDispose](): Promise<void> {}
}
