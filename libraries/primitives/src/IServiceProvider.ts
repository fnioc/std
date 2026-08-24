import { type Type } from './Type/index.js';

/** Resolves service instances by {@link Type}. The abstraction every resolution consumer holds. */
export interface IServiceProvider {
  /** The value registered for `serviceType`, or `undefined` if nothing is registered for it. */
  getService(serviceType: Type): any;
}
