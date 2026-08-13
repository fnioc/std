// `signatureof(ctor)` binds a class constructor or factory function and, at build time, becomes
// the `ConstructorType` / `FunctionType` node `addClass`/`addFactory` take as their implementation
// type — the instance/return type followed by each dependency's own type, in order.

import type { ConstructorType, FunctionType } from '@rhombus-std/primitives';
import type { Ctor, Func } from '@rhombus-toolkit/func';

/**
 * The dependency-carrying implementation type of a class constructor, substituted with the
 * derived `Type.ctor(...)` node at its call site by the `@rhombus-std/di.extras` authoring
 * transform.
 *
 * @throws {Error} always, unless substituted by the transform — pass the implementation type to
 * `addClass` directly instead.
 *
 * @example
 * ```ts
 * this.addClass(typefor<IFoo>(), Foo, signatureof(Foo));
 * ```
 */
export function signatureof(target: Ctor): ConstructorType;
/**
 * The dependency-carrying implementation type of a factory function, substituted with the
 * derived `Type.func(...)` node at its call site by the `@rhombus-std/di.extras` authoring
 * transform.
 *
 * @throws {Error} always, unless substituted by the transform — pass the implementation type to
 * `addFactory` directly instead.
 *
 * @example
 * ```ts
 * this.addFactory(typefor<IFoo>(), makeFoo, signatureof(makeFoo));
 * ```
 */
export function signatureof(target: Func<never[], unknown>): FunctionType;
export function signatureof(target: Ctor | Func<never[], unknown>): ConstructorType | FunctionType {
  void target;
  throw new Error(
    "signatureof(ctor) requires @rhombus-std/di.extras's authoring transform to run. "
      + 'It has not been applied. Depend on @rhombus-std/di.extras so ttsc spawns the '
      + '@rhombus-std transform host, or pass the implementation type explicitly as '
      + 'the third argument to addClass(token, ctor, implType) / addFactory(token, factory, implType).',
  );
}

export const SIGNATUREOF_NAME = 'signatureof';
