import { Type } from '@rhombus-std/primitives';
import { Func } from '@rhombus-toolkit/func';

export interface ScopeCache {
  has(type: Type): boolean;
  get<T = any>(type: Type): T;
  set<T>(type: Type, value: T): T;
  getOrAdd<T>(type: Type, factory: Func<[Type], T>): T;
}

export interface IServiceScope {
  readonly cache: ScopeCache;
  /** The value registered for `type`, resolved against this scope. */
  getRequiredService(type: Type): any;
  /** Whether anything is registered for `type` in this scope. */
  isService(type: Type): boolean;
}
export interface IServiceScopeFactory {
  createScope(name?: string): IServiceScope;
}

/** Scaffold: the async face of a scope, pending the scope model. */
export class AsyncServiceScope {
  constructor(readonly scope: IServiceScope) {}
}
