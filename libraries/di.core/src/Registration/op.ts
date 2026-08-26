import { assertNever } from '@rhombus-toolkit/type-guards';
import type { CtorRegistration, FactoryRegistration, Registration, ValueRegistration } from './Registration';

/** Which door the registration came in by, read from the member the registration carries. */
export function kind(registration: Registration<unknown>) {
  if (isCtorRegistration(registration)) {
    return ['ctor', registration] as const;
  }
  if (isFactoryRegistration(registration)) {
    return ['factory', registration] as const;
  }
  if (isValueRegistration(registration)) {
    return ['value', registration] as const;
  }
  return assertNever(registration);
}
export function isCtorRegistration(registration: Registration<any>): registration is CtorRegistration<any> {
  return 'ctor' in registration;
}
export function isFactoryRegistration(registration: Registration<any>): registration is FactoryRegistration<any> {
  return 'factory' in registration;
}
export function isValueRegistration(registration: Registration<any>): registration is ValueRegistration {
  return 'value' in registration;
}
/**
 * Are the two registrations interchangeable — same service type and the same implementer,
 * lifetime, and implementer type?
 */
export function equals(left: Registration<unknown>, right: Registration<unknown>): boolean {
  if (left === right) {
    return true;
  }
  if (kind(left)[0] !== kind(right)[0] || left.address !== right.address) {
    return false;
  }
  if ('ctor' in left) {
    const other = right as CtorRegistration<unknown>;
    return left.ctor === other.ctor && left.lifetime === other.lifetime
      && left.ctorType === other.ctorType;
  }
  if ('factory' in left) {
    const other = right as FactoryRegistration<unknown>;
    return left.factory === other.factory && left.lifetime === other.lifetime
      && left.factoryType === other.factoryType;
  }
  if ('value' in left) {
    return left.value === (right as ValueRegistration).value;
  }
  return assertNever(left);
}
