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
}
export interface IServiceScopeFactory {
  createScope(): IServiceScope;
}
