import { Type } from '@rhombus-std/primitives';
import type { ConstructorType, FunctionType } from '@rhombus-std/primitives';
import type { Ctor, Func } from '@rhombus-toolkit/func';
import type { CtorDescriptor, FactoryDescriptor, ValueDescriptor } from './ServiceDescriptor';

/**
 * Each factory names how the container reaches the service, which its implementer's type cannot
 * say on its own: a function registered as a VALUE is handed back, never called.
 *
 * @throws TypeError - when `ctorType` is abstract — nothing can `new` it directly.
 */
export function ctor<Scopes extends string>(serviceType: Type, implementer: Ctor, ctorType: ConstructorType,
  scope?: Scopes): CtorDescriptor<Scopes> {
  if (ctorType.abstract) {
    throw new TypeError(`${Type.stringify(ctorType)} is abstract — nothing can \`new\` it directly`);
  }
  return { serviceType, ctor: implementer, ctorType, scope };
}

export function factory<Scopes extends string>(serviceType: Type, implementer: Func, factoryType: FunctionType,
  scope?: Scopes): FactoryDescriptor<Scopes> {
  return { serviceType, factory: implementer, factoryType, scope };
}

export function value(serviceType: Type, implementer: unknown): ValueDescriptor {
  return { serviceType, value: implementer };
}
