import { Type } from '@rhombus-std/primitives';
import { assertNever } from '@rhombus-toolkit/type-guards';
import type { CtorDescriptor, FactoryDescriptor, ServiceDescriptor, ValueDescriptor } from './ServiceDescriptor';

/** Which door the registration came in by, read from the member the descriptor carries. */
export function kind(descriptor: ServiceDescriptor<unknown>) {
  if (isCtorDescriptor(descriptor)) {
    return ['ctor', descriptor] as const;
  }
  if (isFactoryDescriptor(descriptor)) {
    return ['factory', descriptor] as const;
  }
  if (isValueDescriptor(descriptor)) {
    return ['value', descriptor] as const;
  }
  return assertNever(descriptor);
}
export function isCtorDescriptor(descriptor: ServiceDescriptor<any>): descriptor is CtorDescriptor<any> {
  return 'ctor' in descriptor;
}
export function isFactoryDescriptor(descriptor: ServiceDescriptor<any>): descriptor is FactoryDescriptor<any> {
  return 'factory' in descriptor;
}
export function isValueDescriptor(descriptor: ServiceDescriptor<any>): descriptor is ValueDescriptor {
  return 'value' in descriptor;
}
/**
 * Closes an open registration against the generics a `Type.match` bound,
 * rewriting `serviceType` and the implementer's type so the result stands on its own.
 */
export function substitute<Scopes>(descriptor: ServiceDescriptor<Scopes>, generics: ReadonlyMap<string, Type>): ServiceDescriptor<Scopes> {
  if (!generics.size) {
    return descriptor;
  }
  const serviceType = Type.substitute(descriptor.serviceType, generics);
  if ('ctor' in descriptor) {
    return { ...descriptor, serviceType, ctorType: Type.substitute(descriptor.ctorType, generics) };
  }
  if ('factory' in descriptor) {
    return { ...descriptor, serviceType, factoryType: Type.substitute(descriptor.factoryType, generics) };
  }
  if ('value' in descriptor) {
    return { ...descriptor, serviceType };
  }
  return assertNever(descriptor);
}

/**
 * Are the two descriptors interchangeable — same slot ({@link matches}) and the same implementer,
 * scope, and implementer type? Two descriptors can occupy the same slot without being equal (a
 * replaced registration), so prefer {@link matches} for slot identity.
 */
export function equals(left: ServiceDescriptor<unknown>, right: ServiceDescriptor<unknown>): boolean {
  if (left === right) {
    return true;
  }
  if (kind(left)[0] !== kind(right)[0] || !matches(left, right)) {
    return false;
  }
  if ('ctor' in left) {
    const other = right as CtorDescriptor<unknown>;
    return left.ctor === other.ctor && left.scope === other.scope
      && left.ctorType === other.ctorType;
  }
  if ('factory' in left) {
    const other = right as FactoryDescriptor<unknown>;
    return left.factory === other.factory && left.scope === other.scope
      && left.factoryType === other.factoryType;
  }
  if ('value' in left) {
    return left.value === (right as ValueDescriptor).value;
  }
  return assertNever(left);
}

/**
 * Do the two occupy the same registration slot? The service type is the whole of a
 * registration's identity — a keyed registration carries its key inside that type, as a tag.
 */
export function matches(left: ServiceDescriptor<unknown>, right: ServiceDescriptor<unknown>): boolean {
  return left.serviceType === right.serviceType;
}
