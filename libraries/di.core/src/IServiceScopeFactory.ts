import type { IDisposableServiceProvider } from './IDisposableServiceProvider.js';

/**
 * Opens scopes under the standard lifetime model — a clone of
 * Microsoft.Extensions.DependencyInjection's `IServiceScopeFactory`. One instance across the whole
 * provider, resolvable from every provider, always the same one.
 *
 * @remarks
 * Every scope it opens is a direct child of the provider `build()` returns, never of the scope the
 * factory was resolved from: scopes are flat, and share nothing but that provider's singletons. A singleton may
 * hold the factory — it is a value, never constructed, so it trips no scope validation.
 *
 * @example
 * ```ts
 * using scope = provider.resolve(typefor<IServiceScopeFactory>()).openScope();
 * const repo = scope.resolve(typefor<IRepo>());
 * ```
 */
export interface IServiceScopeFactory {
  /**
   * A new scope's provider, independent of every other scope; disposing it ends the scope.
   *
   * @throws {ObjectDisposedError} once the provider is disposed.
   */
  openScope(): IDisposableServiceProvider;
}
