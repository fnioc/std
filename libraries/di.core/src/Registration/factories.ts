import { Type } from '@rhombus-std/primitives';
import type { ConstructorType, FunctionType } from '@rhombus-std/primitives';
import type { Ctor, Func } from '@rhombus-toolkit/types';
import type { CtorRegistration, FactoryRegistration, ValueRegistration } from './Registration';

/**
 * Each factory names how the container reaches the service, which its implementer's type cannot
 * say on its own: a function registered as a VALUE is handed back, never called.
 *
 * @remarks
 * The lifetime is a separate overload rather than an optional argument so that omitting it yields
 * a registration whose lifetime is `undefined` — accepted by a vocabulary that admits omission, and
 * refused by one that does not.
 */
export function ctor<Lifetime>(address: Type, implementer: Ctor, ctorType: ConstructorType, lifetime: Lifetime): CtorRegistration<Lifetime>;
export function ctor(address: Type, implementer: Ctor, ctorType: ConstructorType): CtorRegistration<undefined>;
export function ctor(address: Type, implementer: Ctor, ctorType: ConstructorType, lifetime?: unknown): CtorRegistration<any> {
  return { address, ctor: implementer, ctorType, lifetime };
}

export function factory<Lifetime>(address: Type, implementer: Func, factoryType: FunctionType, lifetime: Lifetime): FactoryRegistration<Lifetime>;
export function factory(address: Type, implementer: Func, factoryType: FunctionType): FactoryRegistration<undefined>;
export function factory(address: Type, implementer: Func, factoryType: FunctionType, lifetime?: unknown): FactoryRegistration<any> {
  return { address, factory: implementer, factoryType, lifetime };
}
/**
 * @throws TypeError - when `address` still holds a generic hole anywhere but under a callable
 * root: one erased callable honestly is every closing of its holes, while one instance cannot
 * stand for every closing of an open type.
 */
export function value(address: Type, implementer: unknown): ValueRegistration {
  if (Type.isOpen(address) && !isCallable(address)) {
    throw new TypeError(
      `${address} still holds a generic hole — one value cannot stand for every closing; only a callable can`,
    );
  }
  return { address, value: implementer };
}

/** Is the type a callable at its root, its tag stripped? */
function isCallable(address: Type): boolean {
  const root = address.kind === 'tag' ? address.type : address;
  return root.kind === 'ctor' || root.kind === 'func';
}
