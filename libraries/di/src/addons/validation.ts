import { type Addon, ManifestValidationError, UniversalAddressError, type ValidationFailure } from '@rhombus-std/di.core';
import type { Type } from '@rhombus-std/primitives';
import { planClosedAddresses, registryOf } from '../internal/closed-address-plans.js';

/**
 * Installs a middleware rejecting a registration addressed by nothing but a hole — no request
 * could ever close it, so it can never answer one.
 *
 * @throws {ManifestValidationError} when any registration fails.
 */
export function validateUniversalAddresses<Lifetime>(): Addon<Lifetime> {
  return {
    registrations: [],
    middleware: next => {
      const registry = registryOf(next);
      const failures: ValidationFailure[] = Iterator.from(registry.registrations)
        .filter(registration => registration.address.kind === 'generic')
        .map(registration => ({ address: registration.address, error: new UniversalAddressError(registration.address) }))
        .toArray();
      if (failures.length) {
        throw new ManifestValidationError(failures);
      }
      return next;
    },
  };
}

/**
 * Installs a middleware planning every closed address the manifest answers — a plan that cannot
 * build is a failure.
 *
 * @throws {ManifestValidationError} when any address fails to plan.
 */
export function validateBuildability<Lifetime>(): Addon<Lifetime> {
  return {
    registrations: [],
    middleware: next => {
      const registry = registryOf(next);
      const failures: ValidationFailure[] = Iterator.from(planClosedAddresses(registry))
        .filter((planned): planned is { address: Type; error: Error; } => 'error' in planned)
        .toArray();
      if (failures.length) {
        throw new ManifestValidationError(failures);
      }
      return next;
    },
  };
}
