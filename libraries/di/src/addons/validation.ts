import { type Addon, type AddonInstallation, CaptiveDependencyError, Control, type LifetimePolicy, ManifestValidationError, type Registration, UniversalAddressError,
  type ValidationFailure } from '@rhombus-std/di.core';
import type { Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';
import { assertNever } from '@rhombus-toolkit/type-guards';
import { askForControl } from '../internal/control-recognition.js';
import { Plan } from '../internal/Plan/index.js';
import { Registry } from '../internal/Registry.js';

/** The registry `next` resolves against, read once through the manifest control. */
function registryOf(next: Func<[request: Type], unknown>): Registry {
  const registrations = askForControl<Iterable<Registration<unknown>>>({ getService: next }, typefor<Control<Iterable<Registration<unknown>>>>());
  return new Registry(registrations);
}

/** One closed address, planned — or the error planning it threw. */
type PlannedAddress = { readonly address: Type; readonly plan: Plan; } | { readonly address: Type; readonly error: Error; };

/** Plans every closed address in `registry`; an address that fails to plan yields its error instead. */
function* planClosedAddresses(registry: Registry): Generator<PlannedAddress> {
  for (const address of registry.closedAddresses) {
    try {
      yield { address, plan: Plan.from(address, registry) };
    } catch (error) {
      yield { address, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }
}

/**
 * Installs a middleware rejecting a registration addressed by nothing but a hole — no request
 * could ever close it, so it can never answer one.
 *
 * @throws {ManifestValidationError} when any registration fails.
 */
export function validateUniversalAddresses(): Addon {
  return {
    create(): AddonInstallation {
      return {
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
    },
  };
}

/**
 * Installs a middleware planning every closed address the manifest answers — a plan that cannot
 * build is a failure.
 *
 * @throws {ManifestValidationError} when any address fails to plan.
 */
export function validateBuildability(): Addon {
  return {
    create(): AddonInstallation {
      return {
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
    },
  };
}

/**
 * Installs a middleware walking every buildable address for captive pairs — a kept registration
 * whose subtree constructs one kept by a narrower tier — reading lifetimes through `policy`.
 *
 * @throws {ManifestValidationError} when any captive pair is found.
 */
export function validateCaptivity(policy: LifetimePolicy): Addon {
  return {
    create(): AddonInstallation {
      return {
        middleware: next => {
          const registry = registryOf(next);
          const reported = new Map<Type, Set<Type>>();
          const failures: ValidationFailure[] = Iterator.from(planClosedAddresses(registry))
            .filter((planned): planned is { address: Type; plan: Plan; } => 'plan' in planned)
            .flatMap(({ plan }) => captivePairs(plan, undefined, policy, reported))
            .toArray();
          if (failures.length) {
            throw new ManifestValidationError(failures);
          }
          return next;
        },
      };
    },
  };
}

function* captivePairs(
  plan: Plan,
  keeper: { address: Type; tier: number; } | undefined,
  policy: LifetimePolicy,
  reported: Map<Type, Set<Type>>,
): Generator<ValidationFailure> {
  switch (plan.kind) {
    case 'registered-ctor':
    case 'registered-factory': {
      const classification = policy.classify(plan.registration);
      if (classification === 'unkept' || classification === undefined) {
        for (const arg of plan.args) {
          yield* captivePairs(arg, keeper, policy, reported);
        }
        return;
      }
      if (keeper !== undefined && classification.tier > keeper.tier && !reported.get(keeper.address)?.has(plan.populatedAddress)) {
        reported.getOrInsertComputed(keeper.address, () => new Set()).add(plan.populatedAddress);
        yield { address: keeper.address, error: new CaptiveDependencyError(keeper.address, plan.populatedAddress) };
      }
      const nextKeeper = { address: plan.populatedAddress, tier: classification.tier };
      for (const arg of plan.args) {
        yield* captivePairs(arg, nextKeeper, policy, reported);
      }
      return;
    }
    case 'ctor':
    case 'factory': {
      for (const arg of plan.args) {
        yield* captivePairs(arg, keeper, policy, reported);
      }
      return;
    }
    case 'iterable':
    case 'array': {
      for (const member of plan.types) {
        yield* captivePairs(member, keeper, policy, reported);
      }
      return;
    }
    // Each of these ends the sweep: a value, a provider facade, or a call the container only
    // makes once someone invokes it, which no build-time reading can follow.
    case 'constant':
    case 'invoker':
    case 'latebound':
    case 'latebound-arg':
    case 'service-provider':
      return;
    default:
      return assertNever(plan);
  }
}
