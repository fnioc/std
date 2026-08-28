import { type AddonInstallation, CaptiveDependencyError, type ChainAddon, Control, type LifetimePolicy, ManifestValidationError, type Registration, UniversalAddressError,
  type ValidationFailure } from '@rhombus-std/di.core';
import type { Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import { assertNever } from '@rhombus-toolkit/type-guards';
import { askForControl } from '../internal/control-recognition.js';
import { Plan } from '../internal/Plan/index.js';
import { Registry } from '../internal/Registry.js';

/**
 * The up-front sweep: a registration addressed by nothing but a hole is a failure on its own, and
 * every closed address is planned — a plan that cannot build is a failure, and one that can is
 * inspected for captive pairs — a kept registration whose subtree constructs one kept by a
 * narrower tier.
 *
 * @throws {ManifestValidationError} when anything fails.
 */
function validateBuild(registry: Registry, policy: LifetimePolicy): void {
  const reported = new Map<Type, Set<Type>>();
  const failures: ValidationFailure[] = [
    ...Iterator.from(registry.registrations)
      .filter(registration => registration.address.kind === 'generic')
      .map(registration => ({ address: registration.address, error: new UniversalAddressError(registration.address) })),
    ...Iterator.from(registry.closedAddresses)
      .flatMap(function*(address) {
        let plan: Plan;
        try {
          plan = Plan.from(address, registry);
        } catch (error) {
          yield { address, error: error instanceof Error ? error : new Error(String(error)) };
          return;
        }
        yield* captivePairs(plan, undefined);
      }),
  ];
  if (failures.length) {
    throw new ManifestValidationError(failures);
  }

  function* captivePairs(plan: Plan, keeper: { address: Type; tier: number; } | undefined): Generator<ValidationFailure> {
    switch (plan.kind) {
      case 'registered-ctor':
      case 'registered-factory': {
        const classification = policy.classify(plan.registration);
        if (classification === 'unkept' || classification === undefined) {
          for (const arg of plan.args) {
            yield* captivePairs(arg, keeper);
          }
          return;
        }
        if (keeper !== undefined && classification.tier > keeper.tier && !reported.get(keeper.address)?.has(plan.populatedAddress)) {
          reported.getOrInsertComputed(keeper.address, () => new Set()).add(plan.populatedAddress);
          yield { address: keeper.address, error: new CaptiveDependencyError(keeper.address, plan.populatedAddress) };
        }
        const nextKeeper = { address: plan.populatedAddress, tier: classification.tier };
        for (const arg of plan.args) {
          yield* captivePairs(arg, nextKeeper);
        }
        return;
      }
      case 'ctor':
      case 'factory': {
        for (const arg of plan.args) {
          yield* captivePairs(arg, keeper);
        }
        return;
      }
      case 'iterable':
      case 'array': {
        for (const member of plan.types) {
          yield* captivePairs(member, keeper);
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
}

/**
 * Sweeps the manifest at build, reading lifetimes through `policy`: unbuildable plans, captive
 * dependencies, and registrations addressed by nothing but a hole aggregate into one
 * {@link ManifestValidationError}.
 */
export function validation(policy: LifetimePolicy): ChainAddon {
  return {
    create(): AddonInstallation {
      return {
        middleware: next => {
          const registrations = askForControl<Iterable<Registration<unknown>>>({ getService: next }, typefor<Control<Iterable<Registration<unknown>>>>());
          validateBuild(new Registry(registrations), policy);
          return next;
        },
      };
    },
  };
}
