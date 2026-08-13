import { Type } from '@rhombus-std/primitives';
import { assertNever } from '@rhombus-toolkit/type-guards';
import type { CtorServiceDescriptor, FactoryServiceDescriptor, ServiceDescriptor,
  ValuedServiceDescriptor } from './expressions';
import { TypeSignatures } from './Signature';

/**
 * Closes an open registration against the placeholders a `Type.satisfies` match captured,
 * rewriting `serviceType` and every signature parameter so the result stands on its own.
 */
export function substitute<Scopes extends string>(descriptor: ServiceDescriptor<Scopes>,
  placeholders: ReadonlyMap<string, Type>): ServiceDescriptor<Scopes> {
  if (!placeholders.size) {
    return descriptor;
  }
  const serviceType = Type.substitute(descriptor.serviceType, placeholders);
  switch (descriptor.kind) {
    case 'value':
      return { ...descriptor, serviceType };
    case 'ctor':
      return {
        ...descriptor,
        serviceType,
        signatures: TypeSignatures.substituteSignatures(descriptor.signatures, placeholders),
      };
    case 'factory':
      return {
        ...descriptor,
        serviceType,
        signatures: TypeSignatures.substituteSignatures(descriptor.signatures, placeholders),
      };
    default:
      return assertNever(descriptor);
  }
}

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
      return left.ctor === other.ctor && left.scope === other.scope
        && TypeSignatures.signaturesEqual(left.signatures, other.signatures);
    }
    case 'factory': {
      const other = right as FactoryServiceDescriptor<string>;
      return left.factory === other.factory && left.scope === other.scope
        && TypeSignatures.signaturesEqual(left.signatures, other.signatures);
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
