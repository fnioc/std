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
 * Are the two descriptors interchangeable — same service type and the same implementer,
 * lifetime, and implementer type?
 */
export function equals(left: ServiceDescriptor<unknown>, right: ServiceDescriptor<unknown>): boolean {
  if (left === right) {
    return true;
  }
  if (kind(left)[0] !== kind(right)[0] || left.serviceType !== right.serviceType) {
    return false;
  }
  if ('ctor' in left) {
    const other = right as CtorDescriptor<unknown>;
    return left.ctor === other.ctor && left.lifetime === other.lifetime
      && left.ctorType === other.ctorType;
  }
  if ('factory' in left) {
    const other = right as FactoryDescriptor<unknown>;
    return left.factory === other.factory && left.lifetime === other.lifetime
      && left.factoryType === other.factoryType;
  }
  if ('value' in left) {
    return left.value === (right as ValueDescriptor).value;
  }
  return assertNever(left);
}
