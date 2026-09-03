import type { IServiceProvider } from '@rhombus-std/di.core';
import type { Caching, Owning } from '../lifetime-scope.js';

/**
 * One scope's state under the standard lifetime model: what it caches, what it owns, and whether
 * it has ended. The container's own scope holds the singletons; every `openScope()` mints another.
 */
export interface Scope extends Caching, Owning {
  /** The provider asks under this scope answer for `IServiceProvider`. */
  provider: IServiceProvider | undefined;
}

export function newScope(): Scope {
  return { cache: new Map(), disposables: [], provider: undefined, disposed: false };
}
