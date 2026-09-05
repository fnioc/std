import { type Type } from '@rhombus-std/primitives';

/** Resolves service instances by {@link Type}. */
export interface IServiceProvider {
  /** Internal use only. Use {@link resolve} instead. */
  getService(address: Type): any;
}
