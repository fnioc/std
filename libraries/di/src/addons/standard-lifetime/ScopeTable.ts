import type { IServiceProvider } from '@rhombus-std/di.core';
import type { Caching, Owning } from '../lifetime-scope.js';

/**
 * One scope under the standard lifetime model: what it caches, what it owns, and whether it has
 * ended.
 *
 * @remarks
 * The singleton scope holds the singletons and is one entry like any other.
 */
export interface Scope extends Caching, Owning {
  /** What the marker of this scope's provider stamps on every ask entering through it. */
  readonly id: symbol;
  /** The provider asks under this scope answer for `IServiceProvider`; absent for the singleton scope, which answers a fresh view instead. */
  provider: IServiceProvider | undefined;
}

/** Every scope still open under one build, by id. */
export class ScopeTable {
  readonly #scopes = new Map<symbol, Scope>();
  #opened = 0;

  /** A fresh scope, caching nothing and owning nothing, filed under an id of its own. */
  open(): Scope {
    const scope: Scope = {
      id: Symbol(`scope-${++this.#opened}`),
      cache: new Map(),
      disposables: [],
      provider: undefined,
      disposed: false,
    };
    this.#scopes.set(scope.id, scope);
    return scope;
  }

  /** The scope `id` names, or `undefined` once it has closed. */
  get(id: symbol): Scope | undefined {
    return this.#scopes.get(id);
  }

  /** Drops `scope`, so its provider refuses even while the instances it owns are still disposing. */
  close(scope: Scope): void {
    this.#scopes.delete(scope.id);
  }
}
