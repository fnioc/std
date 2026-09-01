import { type Type } from '@rhombus-std/primitives';

/**
 * Resolves service instances by {@link Type}. The abstraction every resolution consumer holds —
 * `resolve`/`resolveMany` and the latebound overloads layer onto this interface as the everyday
 * surface; `getService` itself is the one primitive underneath all of them.
 */
export interface IServiceProvider {
  /**
   * The value registered for `address`.
   *
   * @remarks
   * A caller for whom absence is an answer rather than a fault spells that in the address it
   * asks for: `getService(Type.union(address, typefor<undefined>()))` orders the `undefined`
   * literal last, so it answers only once `address` itself has no way to build. `resolve(address)`
   * is the same answer under a name that reads better at a call site.
   *
   * @throws UnsatisfiableError - when nothing can produce `address`.
   */
  getService(address: Type): any;
}
