import { type ConstructorType, type FunctionType, Type } from '@rhombus-std/primitives';
import type { Ctor, Func } from '@rhombus-toolkit/func';

/**
 * Calls `callable`, its dependencies resolved from the constructor or function type it closes
 * over — the same shape any other registered implementer carries.
 *
 * @remarks
 * Nothing registers one — the engine answers the address by synthesis; `resolve`'s callable
 * overloads are the usual door.
 */
export interface Invoker<C extends Ctor | Func> {
  (callable: C): C extends Ctor<any[], infer R> ? R : C extends Func<any[], infer R> ? R : never;
}

/** The address requesting an {@link Invoker} closed over `callableType`. */
export function invokerAddress(callableType: ConstructorType | FunctionType): Type {
  return Type.imported('Invoker', '@rhombus-std/di.core', [callableType]);
}
