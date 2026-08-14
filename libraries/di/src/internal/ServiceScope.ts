import type { IServiceScope, IServiceScopeFactory, ScopeCache } from '@rhombus-std/di.core';
import { augment, type IServiceProvider, type Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';
import type { Engine } from './Engine.js';

/**
 * A {@link ScopeCache} backed by a `Map`, keyed on the interned requested type. Disposal walks
 * every value it ever stored in reverse insertion order — the usual last-constructed-first-
 * disposed convention — calling whichever of {@link Symbol.dispose}/{@link Symbol.asyncDispose}
 * the value carries; a value with neither is skipped.
 */
class MapScopeCache implements ScopeCache {
  readonly #values = new Map<Type, unknown>();

  has(type: Type): boolean {
    return this.#values.has(type);
  }

  get<T = any>(type: Type): T {
    return this.#values.get(type) as T;
  }

  set<T>(type: Type, value: T): T {
    this.#values.set(type, value);
    return value;
  }

  getOrAdd<T>(type: Type, factory: Func<[Type], T>): T {
    if (this.#values.has(type)) {
      return this.#values.get(type) as T;
    }
    return this.set(type, factory(type));
  }

  [Symbol.dispose](): void {
    for (const value of [...this.#values.values()].toReversed()) {
      (value as Partial<Disposable>)?.[Symbol.dispose]?.();
    }
  }

  async [Symbol.asyncDispose](): Promise<void> {
    for (const value of [...this.#values.values()].toReversed()) {
      const disposable = value as Partial<Disposable> & Partial<AsyncDisposable>;
      await (disposable?.[Symbol.asyncDispose]?.() ?? disposable?.[Symbol.dispose]?.());
    }
  }
}

/**
 * A resolution scope bound to the engine it was opened from: lookups run through that engine,
 * scoped-lifetime instances land in this scope's own {@link cache}, and this scope's disposal
 * disposes whichever of them turned out disposable.
 */
export class ServiceScope implements IServiceScope, Disposable, AsyncDisposable {
  readonly #engine: Engine;
  readonly #serviceProvider: IServiceProvider;
  readonly #cache = new MapScopeCache();

  constructor(engine: Engine, serviceProvider: IServiceProvider, readonly name?: string) {
    this.#engine = engine;
    this.#serviceProvider = serviceProvider;
  }

  get cache(): ScopeCache {
    return this.#cache;
  }

  getRequiredService(type: Type): any {
    return this.#engine.resolve(type, { serviceProvider: this.#serviceProvider, scope: this });
  }

  isService(type: Type): boolean {
    return this.#engine.canResolve(type);
  }

  [Symbol.dispose](): void {
    this.#cache[Symbol.dispose]();
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.#cache[Symbol.asyncDispose]();
  }
}

// Merged rather than `implements`: `createAsyncScope` is an augmented member the registry installs
// at runtime, which `implements` would demand statically.
export interface ServiceScopeFactory extends IServiceScopeFactory {}

/** Opens {@link ServiceScope}s against the engine it was realized from, tracking each for disposal. */
@augment(typefor<IServiceScopeFactory>())
export class ServiceScopeFactory {
  readonly #engine: Engine;
  readonly #serviceProvider: IServiceProvider;

  constructor(engine: Engine, serviceProvider: IServiceProvider) {
    this.#engine = engine;
    this.#serviceProvider = serviceProvider;
  }

  createScope(name?: string): IServiceScope {
    return this.#engine.createScope(name, this.#serviceProvider);
  }
}
