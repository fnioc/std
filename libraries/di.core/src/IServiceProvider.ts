import { type Type } from '@rhombus-std/primitives';

/** Resolves service instances by {@link Type}. The abstraction every resolution consumer holds. */
export interface IServiceProvider {
  /**
   * The value registered for `serviceType`.
   *
   * @remarks
   * A caller for whom absence is an answer rather than a fault spells that in the address it
   * asks for: `getService(Type.union(serviceType, typefor<undefined>()))` orders the `undefined`
   * literal last, so it answers only once `serviceType` itself has no way to build.
   *
   * @throws UnsatisfiableError - when nothing can produce `serviceType`.
   */
  getService(serviceType: Type): any;
}
