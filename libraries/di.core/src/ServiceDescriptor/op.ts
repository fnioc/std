import { Type } from '@rhombus-std/primitives';
import { assertNever } from '@rhombus-toolkit/type-guards';
import type { CtorDescriptor, FactoryDescriptor, ServiceDescriptor, ValueDescriptor } from './ServiceDescriptor';

/**
 * Closes an open registration against the generics a `Type.satisfies` match captured,
 * rewriting `serviceType` and the implementer's type so the result stands on its own.
 */
export function substitute<Scopes extends string>(descriptor: ServiceDescriptor<Scopes>,
  generics: ReadonlyMap<string, Type>): ServiceDescriptor<Scopes> {
  if (!generics.size) {
    return descriptor;
  }
  const serviceType = Type.substitute(descriptor.serviceType, generics);
  switch (descriptor.kind) {
    case 'value':
      return { ...descriptor, serviceType, implementerType: Type.substitute(descriptor.implementerType, generics) };
    case 'ctor':
      return { ...descriptor, serviceType, implementerType: Type.substitute(descriptor.implementerType, generics) };
    case 'factory':
      return { ...descriptor, serviceType, implementerType: Type.substitute(descriptor.implementerType, generics) };
    default:
      return assertNever(descriptor);
  }
}

/**
 * Are the two descriptors interchangeable — same slot ({@link matches}) and the same implementer,
 * scope, and implementer type? Two descriptors can occupy the same slot without being equal (a
 * replaced registration), so prefer {@link matches} for slot identity.
 */
export function equals(left: ServiceDescriptor<string>, right: ServiceDescriptor<string>): boolean {
  if (left === right) {
    return true;
  }
  if (left.kind !== right.kind || !matches(left, right)) {
    return false;
  }
  switch (left.kind) {
    case 'ctor': {
      const other = right as CtorDescriptor<string>;
      return left.implementer === other.implementer && left.scope === other.scope
        && left.implementerType === other.implementerType;
    }
    case 'factory': {
      const other = right as FactoryDescriptor<string>;
      return left.implementer === other.implementer && left.scope === other.scope
        && left.implementerType === other.implementerType;
    }
    case 'value':
      return left.implementer === (right as ValueDescriptor).implementer;
    default:
      return assertNever(left);
  }
}

/**
 * Do the two occupy the same registration slot? The service type is the whole of a
 * registration's identity — a keyed registration carries its key inside that type, as a tag.
 */
export function matches(left: ServiceDescriptor<string>, right: ServiceDescriptor<string>): boolean {
  return left.serviceType === right.serviceType;
}
