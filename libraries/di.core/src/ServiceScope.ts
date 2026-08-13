import { Type } from '@rhombus-std/primitives';
import { Func } from '@rhombus-toolkit/func';

/** Per-scope storage for scoped-lifetime resolutions, keyed by service {@link Type}. */
export interface ScopeCache {
  has(type: Type): boolean;
  get<T = any>(type: Type): T;
  set<T>(type: Type, value: T): T;
  /** The cached value for `type`, computing and storing it via `factory` on first request. */
  getOrAdd<T>(type: Type, factory: Func<[Type], T>): T;
}

/** A resolution scope: shares one {@link cache} of scoped-lifetime instances across its lookups. */
export interface IServiceScope {
  readonly cache: ScopeCache;
  /** The value registered for `type`, resolved against this scope. */
  getRequiredService(type: Type): any;
  /** Whether anything is registered for `type` in this scope. */
  isService(type: Type): boolean;
}
export interface IServiceScopeFactory {
  /** Opens a new {@link IServiceScope}, optionally labeled `name` for diagnostics. */
  createScope(name?: string): IServiceScope;
}

/** Scaffold: the async face of a scope, pending the scope model. */
export class AsyncServiceScope {
  constructor(readonly scope: IServiceScope) {}
}
