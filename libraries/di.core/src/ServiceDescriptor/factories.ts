import type { ConstructorType, FunctionType, Type } from '@rhombus-std/primitives';
import type { Ctor, Func } from '@rhombus-toolkit/func';
import type { CtorDescriptor, FactoryDescriptor, ValueDescriptor } from './ServiceDescriptor';

/**
 * Each factory names how the container reaches the service, which its implementer's type cannot
 * say on its own: a function registered as a VALUE is handed back, never called.
 */

export function ctor<Scopes extends string>(serviceType: Type, implementer: Ctor, implementerType: ConstructorType,
  scope?: Scopes): CtorDescriptor<Scopes> {
  return { kind: 'ctor', serviceType, implementer, implementerType, scope };
}

export function factory<Scopes extends string>(serviceType: Type, implementer: Func, implementerType: FunctionType,
  scope?: Scopes): FactoryDescriptor<Scopes> {
  return { kind: 'factory', serviceType, implementer, implementerType, scope };
}

/**
 * @param implementerType - the value's own static type; the address it is registered under when
 * the caller names no other.
 */
export function value(serviceType: Type, implementer: unknown, implementerType?: Type): ValueDescriptor {
  return { kind: 'value', serviceType, implementer, implementerType: implementerType ?? serviceType };
}
