import { type Ctor, type Func } from '@rhombus-toolkit/func';
import { type ConstructorType, type FunctionType, type Type } from './Type/Type.js';

/** Resolves service instances by {@link Type}. The abstraction every resolution consumer holds. */
export interface IServiceProvider {
  /** The value registered for `type`, or `undefined` if nothing is registered for it. */
  getService(type: Type): any;
  /**
   * Constructs `ctor` fresh, its dependencies resolved from `type` — `ctor`'s own parameter
   * types, in order, the same shape {@link ConstructorType} carries for any other registered
   * constructor.
   *
   * @remarks
   * Nothing here is registered or cached: two calls build two instances, even for a `ctor`
   * separately registered elsewhere under its own address.
   */
  getService<R>(type: ConstructorType, ctor: Ctor<any[], R>): R;
  /**
   * Calls `func`, its dependencies resolved from `type` — `func`'s own parameter types, in
   * order, the same shape {@link FunctionType} carries for any other registered factory.
   *
   * @remarks
   * Nothing here is registered or cached: two calls build two results, even for a `func`
   * separately registered elsewhere under its own address.
   */
  getService<R>(type: FunctionType, func: Func<any[], R>): R;
}
