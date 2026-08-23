import type { IServiceProvider } from '@rhombus-std/primitives';
import type { LifetimeArgument } from './LifetimeModel';

/**
 * The well-known address for opening scopes: the installed lifetime model supplies the
 * implementation, and the returned provider resolves inside the scope it opened. `lifetime`
 * names the scope in the very vocabulary registrations carry, so what creation passes is what a
 * registration references to match it.
 */
export interface ScopeFactory<Lifetime> {
  (...lifetime: LifetimeArgument<Lifetime>): IServiceProvider;
}
