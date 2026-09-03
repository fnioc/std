import type { IServiceProvider } from './IServiceProvider.js';

/**
 * Opens scopes under the tagged lifetime model: one per tag of the vocabulary, each over the
 * provider this factory was resolved from, so a scope opened from a scoped provider chains onto it.
 *
 * @remarks
 * The factory is constructed afresh on every resolution and bound to the provider the ask came
 * from — asked for directly or injected, it opens scopes over that provider. An ask through a
 * scope is checked by every scope on its chain, the innermost first, and a hit anywhere answers
 * the cached instance; a registration whose tag no open scope on the chain carries is constructed
 * afresh, as a registration naming no lifetime always is.
 *
 * @typeParam Lifetime - the vocabulary exactly as the container spells it, `undefined` included;
 * `openScope` takes every member but `undefined`, since no scope holds transients.
 *
 * @example
 * ```ts
 * type Lifetime = 'session' | 'request' | undefined;
 *
 * using session = provider.resolve(typefor<ITaggedServiceScopeFactory<Lifetime>>()).openScope('session');
 * using request = session.resolve(typefor<ITaggedServiceScopeFactory<Lifetime>>()).openScope('request');
 * const current = request.resolve(typefor<Session>()); // one per session scope, reached from the request scope
 * ```
 */
export interface ITaggedServiceScopeFactory<Lifetime> {
  /**
   * A provider caching registrations of `lifetime` alone, chained onto the provider this factory
   * came from; disposing it ends the scope.
   */
  openScope(lifetime: Exclude<Lifetime, undefined>): IServiceProvider;
}
