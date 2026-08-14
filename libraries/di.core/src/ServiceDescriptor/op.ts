import { Type } from '@rhombus-std/primitives';
import { assertNever } from '@rhombus-toolkit/type-guards';
import type { CtorServiceDescriptor, FactoryServiceDescriptor, ServiceDescriptor,
  ValuedServiceDescriptor } from './expressions';

/**
 * Closes an open registration against the generics a `Type.satisfies` match captured,
 * rewriting `serviceType` and the implementation type so the result stands on its own.
 */
export function substitute<Scopes extends string>(descriptor: ServiceDescriptor<Scopes>,
  generics: ReadonlyMap<string, Type>): ServiceDescriptor<Scopes> {
  if (!generics.size) {
    return descriptor;
  }
  const serviceType = Type.substitute(descriptor.serviceType, generics);
  switch (descriptor.kind) {
    case 'value':
      return { ...descriptor, serviceType };
    case 'ctor':
      return { ...descriptor, serviceType, implType: Type.substitute(descriptor.implType, generics) };
    case 'factory':
      return { ...descriptor, serviceType, implType: Type.substitute(descriptor.implType, generics) };
    default:
      return assertNever(descriptor);
  }
}

/**
 * Are the two descriptors interchangeable — same slot ({@link matches}) and the same
 * implementation, scope, and implementation type? Two descriptors can occupy the same slot without
 * being equal (a replaced registration), so prefer {@link matches} for slot identity.
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
      const other = right as CtorServiceDescriptor<string>;
      return left.ctor === other.ctor && left.scope === other.scope && left.implType === other.implType;
    }
    case 'factory': {
      const other = right as FactoryServiceDescriptor<string>;
      return left.factory === other.factory && left.scope === other.scope && left.implType === other.implType;
    }
    case 'value':
      return left.value === (right as ValuedServiceDescriptor<string>).value;
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
