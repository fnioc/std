import { CaptiveDependencyError, ManifestValidationError, type Middleware, type Registration, type ValidationFailure } from '@rhombus-std/di.core';
import type { Type } from '@rhombus-std/primitives';
import { assertNever } from '@rhombus-toolkit/type-guards';
import { planClosedAddresses, registryOf } from '../../internal/closed-address-plans.js';
import type { Plan } from '../../internal/Plan/index.js';
import { readKeeping, readLifetime } from './standard.lifetime.js';

/** Where `registration`'s product is kept in the standard tiers. */
function classifyStandardKeeping(registration: Registration<unknown> | undefined): { readonly tier: number; } | 'unkept' | undefined {
  const lifetime = readLifetime(registration);
  if (lifetime === undefined) {
    return undefined;
  }
  const keeping = readKeeping(lifetime);
  switch (keeping) {
    case 'singleton': {
      return { tier: 0 };
    }
    case 'scoped': {
      return { tier: 1 };
    }
    case 'transient': {
      return 'unkept';
    }
    default: {
      return assertNever(keeping);
    }
  }
}

/** Walks every buildable address for captive pairs — a kept registration whose subtree constructs one kept by a narrower tier. */
export function validateStandardCaptivity(): Middleware {
  return next => {
    const registry = registryOf(next);
    const reported = new Map<Type, Set<Type>>();
    const failures: ValidationFailure[] = Iterator.from(planClosedAddresses(registry))
      .filter((planned): planned is { address: Type; plan: Plan; } => 'plan' in planned)
      .flatMap(({ plan }) => captivePairs(plan, undefined, reported))
      .toArray();
    if (failures.length) {
      throw new ManifestValidationError(failures);
    }
    return next;
  };
}

function* captivePairs(
  plan: Plan,
  keeper: { address: Type; tier: number; } | undefined,
  reported: Map<Type, Set<Type>>,
): Generator<ValidationFailure> {
  switch (plan.kind) {
    case 'registered-ctor':
    case 'registered-factory': {
      yield* keptSubtree(plan.registration, plan.populatedAddress, plan.args, keeper, reported);
      return;
    }
    // A wrap the engine synthesized keeps nothing; its subtree answers to the enclosing keeper.
    case 'promise': {
      yield* descend([plan.inner, ...plan.inventory], keeper, reported);
      return;
    }
    // A boundary a registration answered keeps the promise it hands over, so it is the keeper
    // for its whole subtree — the dependencies it awaits alongside the construction it wraps.
    case 'registered-promise': {
      yield* keptSubtree(plan.registration, plan.envelope.populatedAddress, [plan.envelope.inner, ...plan.envelope.inventory], keeper, reported);
      return;
    }
    case 'async': {
      yield* captivePairs(plan.inner, keeper, reported);
      return;
    }
    case 'async-iterable': {
      yield* descend(plan.elements, keeper, reported);
      return;
    }
    case 'ctor':
    case 'factory': {
      yield* descend(plan.args, keeper, reported);
      return;
    }
    case 'iterable':
    case 'array': {
      yield* descend(plan.types, keeper, reported);
      return;
    }
    // Each of these ends the sweep: a value, a provider facade, or a call the container only
    // makes once someone invokes it, which no build-time reading can follow.
    case 'constant':
    case 'invoker':
    case 'latebound':
    case 'latebound-arg':
    case 'service-provider': {
      return;
    }
    default: {
      return assertNever(plan);
    }
  }
}

/** The subtree of a plan node kept by `registration`: it becomes the keeper everything beneath answers to. */
function* keptSubtree(
  registration: Registration<unknown>,
  populatedAddress: Type,
  beneath: readonly Plan[],
  keeper: { address: Type; tier: number; } | undefined,
  reported: Map<Type, Set<Type>>,
): Generator<ValidationFailure> {
  const classification = classifyStandardKeeping(registration);
  if (classification === 'unkept' || classification === undefined) {
    yield* descend(beneath, keeper, reported);
    return;
  }
  if (keeper !== undefined && classification.tier > keeper.tier && !reported.get(keeper.address)?.has(populatedAddress)) {
    reported.getOrInsertComputed(keeper.address, () => new Set()).add(populatedAddress);
    yield { address: keeper.address, error: new CaptiveDependencyError(keeper.address, populatedAddress) };
  }
  yield* descend(beneath, { address: populatedAddress, tier: classification.tier }, reported);
}

function* descend(
  plans: readonly Plan[],
  keeper: { address: Type; tier: number; } | undefined,
  reported: Map<Type, Set<Type>>,
): Generator<ValidationFailure> {
  for (const plan of plans) {
    yield* captivePairs(plan, keeper, reported);
  }
}
