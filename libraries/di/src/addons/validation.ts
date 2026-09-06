import { type Addon, type AddonInstallation, ControlRequest, type ControlService, UniversalAddressError, UnsatisfiableError } from '@rhombus-std/di.core';
import type { Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import { planClosedAddresses } from '../internal/closed-address-plans.js';
import { InstalledHooks } from '../internal/Plan/InstalledHooks.js';
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
 * @throws {AggregateError} of a {@link UniversalAddressError} per offending registration.
 */
export function validateUniversalAddresses<Lifetime>(): Addon<Lifetime> {
  return {
    create(): AddonInstallation<Lifetime> {
      return {
        registrations: [],
        middleware: next => {
          const address = typefor<ControlService>();
          const control = next(new ControlRequest(address)) as ControlService;
          if (typeof control?.stageHooks !== 'function') {
            throw new UnsatisfiableError(address, 'a middleware answered the control ask with something other than the engine control');
          }
          const errors: UniversalAddressError[] = Iterator.from(new Registry(control.registry).registrations)
            .filter(registration => registration.address.kind === 'generic')
            .map(registration => new UniversalAddressError(registration.address))
            .toArray();
          if (errors.length) {
            throw new AggregateError(errors, `registrations addressed by nothing but a type parameter (${errors.length})`);
          }
          return next;
        },
      };
    },
  };
}

/**
 * Installs a middleware planning every registration of every closed address the manifest answers —
 * a plan that cannot build is a failure.
 *
 * @remarks
 * A registration a newer one shadows is planned on its own, since a collection ask walks it: a
 * fault only the shadowed registration carries is reported here rather than at that ask.
 *
 * @throws {AggregateError} of the leaf error each registration that could not plan produced.
 */
export function validateBuildability<Lifetime>(): Addon<Lifetime> {
  return {
    create(): AddonInstallation<Lifetime> {
      return {
        registrations: [],
        middleware: next => {
          const address = typefor<ControlService>();
          const control = next(new ControlRequest(address)) as ControlService;
          if (typeof control?.stageHooks !== 'function') {
            throw new UnsatisfiableError(address, 'a middleware answered the control ask with something other than the engine control');
          }
          // Planning at build fires the always-active plan hooks: no ask stands behind this pass,
          // so nothing staged participates.
          const hooks = control instanceof InstalledHooks && control.always.beforePlan.length !== 0 ? { installed: control, active: [] } : undefined;
          const errors: Error[] = Iterator.from(planClosedAddresses(new Registry(control.registry), hooks))
            .filter((planned): planned is { address: Type; error: Error; } => 'error' in planned)
            .map(planned => planned.error)
            .toArray();
          if (errors.length) {
            throw new AggregateError(errors, `cannot satisfy every registration (${errors.length})`);
          }
          return next;
        },
      };
    },
  };
}
