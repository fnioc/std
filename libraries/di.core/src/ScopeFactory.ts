import { Type } from '@rhombus-std/primitives';
import type { IServiceProvider } from './IServiceProvider.js';
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

export namespace ScopeFactory {
  /** The address a model registers its creation verb under, and the one a provider looks for. */
  export const address = Type.imported('ScopeFactory', '@rhombus-std/di.core');
}
