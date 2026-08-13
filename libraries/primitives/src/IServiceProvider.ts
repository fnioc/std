import { type Type } from './Type/Type.js';

/** Resolves service instances by {@link Type}. The abstraction every resolution consumer holds. */
export interface IServiceProvider {
  /** The value registered for `type`, or `undefined` if nothing is registered for it. */
  getService(type: Type): any;
}
