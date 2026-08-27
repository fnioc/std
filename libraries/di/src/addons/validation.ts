import { type AddonInstallation, CaptiveDependencyError, type ChainAddon, type IServiceProvider, type LifetimePolicy, ManifestValidationError, UniversalAddressError,
  type ValidationFailure } from '@rhombus-std/di.core';
import type { Type } from '@rhombus-std/primitives';
import { assertNever } from '@rhombus-toolkit/type-guards';
import { Engine } from '../internal/Engine.js';
import { Plan } from '../internal/Plan/index.js';

/**
 * The up-front sweep: a registration addressed by nothing but a hole is a failure on its own, and
 * every closed address is planned — a plan that cannot build is a failure, and one that can is
 * inspected for captive pairs, a singleton whose subtree constructs a registration with a shorter
 * lifetime.
 *
 * @throws {ManifestValidationError} when anything fails.
 */
function validateBuild(engine: Engine, policy: LifetimePolicy): void {
  const reported = new Map<Type, Set<Type>>();
  const failures: ValidationFailure[] = [
    ...Iterator.from(engine.registry.registrations)
      .filter(registration => registration.address.kind === 'generic')
      .map(registration => ({ address: registration.address, error: new UniversalAddressError(registration.address) })),
    ...Iterator.from(engine.registry.closedAddresses)
      .flatMap(function*(address) {
        let plan: Plan;
        try {
          plan = Plan.from(address, engine.registry);
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

  function* captivePairs(plan: Plan, captor: Type | undefined): Generator<ValidationFailure> {
    switch (plan.kind) {
      case 'registered-ctor':
      case 'registered-factory': {
        const classification = policy.classify(plan.registration);
        if (classification === 'scoped' && captor !== undefined && !reported.get(captor)?.has(plan.populatedAddress)) {
          reported.getOrInsertComputed(captor, () => new Set()).add(plan.populatedAddress);
          yield { address: captor, error: new CaptiveDependencyError(captor, plan.populatedAddress) };
        }
        const below = classification === 'singleton' ? plan.populatedAddress : captor;
        for (const arg of plan.args) {
          yield* captivePairs(arg, below);
        }
        return;
      }
      case 'ctor':
      case 'factory': {
        for (const arg of plan.args) {
          yield* captivePairs(arg, captor);
        }
        return;
      }
      case 'iterable':
      case 'array': {
        for (const member of plan.types) {
          yield* captivePairs(member, captor);
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
      case 'starfish':
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
export function validation<Lifetime>(policy: LifetimePolicy): ChainAddon<Lifetime> {
  return {
    install(): AddonInstallation<Lifetime> {
      return {
        atBuild: (provider: IServiceProvider): void => {
          if (!(provider instanceof Engine)) {
            throw new TypeError('the validation addon sweeps its container at build; install it through withAddon.');
          }
          validateBuild(provider, policy);
        },
      };
    },
  };
}
