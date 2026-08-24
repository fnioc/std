import { type Type } from '@rhombus-std/primitives';

/** Resolves service instances by {@link Type}. The abstraction every resolution consumer holds. */
export interface IServiceProvider<Lifetime = unknown> {
  /** The value registered for `serviceType`, or `undefined` if nothing is registered for it. */
  getService(serviceType: Type): any;
}
