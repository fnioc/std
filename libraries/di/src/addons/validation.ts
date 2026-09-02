import { type Addon, ControlRequest, type ControlService, ManifestValidationError, UniversalAddressError, UnsatisfiableError, type ValidationFailure } from '@rhombus-std/di.core';
import type { Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import { planClosedAddresses } from '../internal/closed-address-plans.js';
import { Registry } from '../internal/Registry.js';

/**
 * Installs a middleware rejecting a registration addressed by nothing but a hole — no request
 * could ever close it, so it can never answer one.
 *
 * @remarks
 * Such a registration matches every ask — this addon's own control ask included — so a manifest
 * already carrying one usually poisons the registry read itself, and the refusal then comes from
 * the control guard rather than as a per-registration failure.
 *
 * @throws {ManifestValidationError} when any registration fails.
 */
export function validateUniversalAddresses<Lifetime>(): Addon<Lifetime> {
  return {
    registrations: [],
    middleware: next => {
      const address = typefor<ControlService>();
      const control = next(new ControlRequest(address)) as ControlService;
      if (typeof control?.stageHooks !== 'function') {
        throw new UnsatisfiableError(address, 'a middleware answered the control ask with something other than the engine control');
      }
      const failures: ValidationFailure[] = Iterator.from(new Registry(control.registry).registrations)
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
      const address = typefor<ControlService>();
      const control = next(new ControlRequest(address)) as ControlService;
      if (typeof control?.stageHooks !== 'function') {
        throw new UnsatisfiableError(address, 'a middleware answered the control ask with something other than the engine control');
      }
      const failures: ValidationFailure[] = Iterator.from(planClosedAddresses(new Registry(control.registry)))
        .filter((planned): planned is { address: Type; error: Error; } => 'error' in planned)
        .toArray();
      if (failures.length) {
        throw new ManifestValidationError(failures);
      }
      return next;
    },
  };
}
