import { Type } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';

/**
 * Per-scope storage for scoped-lifetime resolutions, keyed by whatever the engine identifies a
 * resolution with — stable and unique per registration, not necessarily a bare service
 * {@link Type} (one address can carry several registrations, each its own cache slot).
 */
export interface ScopeCache {
  has(key: unknown): boolean;
  get<T = any>(key: unknown): T;
  set<T>(key: unknown, value: T): T;
  /** The cached value for `key`, computing and storing it via `factory` on first request. */
  getOrAdd<T>(key: unknown, factory: Func<[unknown], T>): T;
}

/** A resolution scope: shares one {@link cache} of scoped-lifetime instances across its lookups. */
export interface IServiceScope {
  readonly cache: ScopeCache;
  /** The value registered for `serviceType`, resolved against this scope. */
  getRequiredService(serviceType: Type): any;
  /** Whether anything is registered for `serviceType` in this scope. */
  isService(serviceType: Type): boolean;
}
export interface IServiceScopeFactory {
  /** Opens a new {@link IServiceScope}, optionally labeled `name` for diagnostics. */
  createScope(name?: string): IServiceScope;
}

/** Scaffold: the async face of a scope, pending the scope model. */
export class AsyncServiceScope {
  constructor(readonly scope: IServiceScope) {}
}
