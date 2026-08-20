import { type Ctor, type Func } from '@rhombus-toolkit/func';
import { type ConstructorType, type FunctionType, type Type } from './Type/index.js';

/** Resolves service instances by {@link Type}. The abstraction every resolution consumer holds. */
export interface IServiceProvider {
  /** The value registered for `serviceType`, or `undefined` if nothing is registered for it. */
  getService(serviceType: Type): any;
  /**
   * Constructs `ctor` fresh, its dependencies resolved from `ctorType` — `ctor`'s own parameter
   * types, in order, the same shape {@link ConstructorType} carries for any other registered
   * constructor.
   *
   * @remarks
   * Nothing here is registered or cached: two calls build two instances, even for a `ctor`
   * separately registered elsewhere under its own address.
   */
  getService<R>(ctorType: ConstructorType, ctor: Ctor<any[], R>): R;
  /**
   * Calls `func`, its dependencies resolved from `funcType` — `func`'s own parameter types, in
   * order, the same shape {@link FunctionType} carries for any other registered factory.
   *
   * @remarks
   * Nothing here is registered or cached: two calls build two results, even for a `func`
   * separately registered elsewhere under its own address.
   */
  getService<R>(funcType: FunctionType, func: Func<any[], R>): R;
}
