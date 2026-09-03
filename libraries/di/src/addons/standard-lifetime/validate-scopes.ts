import { type Addon, type Behavior, ControlRequest, type ControlService, DiError, type Hooks, Registration, type Request, type StandardLifetime, UnsatisfiableError } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import { lifetimeKind } from './symbols.js';

/**
 * A scoped registration reached under the singleton scope: resolved from the container's own
 * provider, or consumed by a singleton — the conditions Microsoft.Extensions.DependencyInjection's
 * scope validation refuses.
 */
export class ScopeValidationError extends DiError {
  /** The scoped service type that was reached. */
  readonly address: Type;

  constructor(address: Type) {
    super(
      `cannot resolve scoped ${address} under the singleton scope — a scoped registration is reached through an opened scope, `
        + `never from the container's own provider or from a singleton's dependencies`,
    );
    this.name = 'ScopeValidationError';
    this.address = address;
  }
}

/**
 * Optional layer over {@link standardLifetime} refusing a scoped registration reached under the
 * singleton scope — a clone of Microsoft.Extensions.DependencyInjection's `ValidateScopes`, off
 * unless added.
 *
 * @remarks
 * Two checks, both raising {@link ScopeValidationError}: a scoped registration resolved from the
 * container's own provider, directly or beneath a transient, checked on every ask; and a scoped
 * registration consumed by a singleton — directly, through a transient, or through another
 * singleton — checked wherever the singleton's dependencies are constructed, from any provider. A
 * singleton holding {@link IServiceScopeFactory} trips neither: the factory is a value, never
 * constructed. Only a registration's own lifetime is read, so the last registration of an address
 * decides a single ask and each element of a collection ask is checked as it is walked.
 *
 * @example
 * ```ts
 * const provider = Builder
 *   .useAddon(standardLifetime())
 *   .useAddon(validateScopes())
 *   .withServices(m => m.add(typefor<IRepo>(), SqlRepo, typefor(SqlRepo), 'scoped'))
 *   .build();
 *
 * provider.resolve(typefor<IRepo>()); // throws ScopeValidationError
 * ```
 */
export function validateScopes(): Addon<StandardLifetime> {
  return {
    registrations: [],
    middleware: next => {
      const address = typefor<ControlService>();
      const control = next(new ControlRequest(address)) as ControlService;
      if (typeof control?.stageHooks !== 'function') {
        throw new UnsatisfiableError(address, 'a middleware answered the control ask with something other than the engine control');
      }
      control.installHooks(hooks);
      return next;
    },
  };
}

/** The lifetime kind the constructions run under: the provider's own, or `'singleton'` beneath a singleton. */
type Kind = 'singleton' | 'scoped' | undefined;

const hooks: Behavior<Kind> = {
  // The captive check, once per plan: a scoped node planned beneath a singleton is refused
  // wherever the plan is made — at build under validateBuildability, else at the first ask.
  beforePlan: (construction: Hooks.Construction<Kind>): Kind => check(construction),

  beginResolve: (request: Request): Kind => request[lifetimeKind] as Kind,

  // The per-ask check: the kind the ask entered under reaches every node the ask constructs, so a
  // scoped node under the container's own kind is refused on every ask, directly or beneath a
  // transient.
  beforeConstruct: (construction: Hooks.Construction<Kind>): Hooks.Interception<Kind> => ({ state: check(construction) }),
};

/**
 * The kind a node's dependencies run under: `'singleton'` beneath a singleton, else the kind it
 * was reached under.
 *
 * @throws {ScopeValidationError} for a scoped node under the singleton kind.
 */
function check({ registration, populatedAddress, state }: Hooks.Construction<Kind>): Kind {
  const lifetime = Registration.isValueRegistration(registration) ? undefined : registration.lifetime;
  if (lifetime === 'scoped' && state === 'singleton') {
    throw new ScopeValidationError(populatedAddress);
  }
  return lifetime === 'singleton' ? 'singleton' : state;
}
