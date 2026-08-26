import { type IServiceProvider, ManifestValidationError, type Realizer, type Registration, UnsatisfiableError, type ValidationFailure } from '@rhombus-std/di.core';
import { type FunctionType, Type } from '@rhombus-std/primitives';
import { Plan } from './Plan/index.js';
import { Registry } from './Registry.js';

export interface ResolveContext {
  /** What a service asking for the provider receives. */
  readonly serviceProvider: IServiceProvider;
}

/**
 * The resolution orchestrator: one per provider, stateless across resolutions — everything
 * per-walk arrives in the {@link ResolveContext}.
 */
export class Engine {
  readonly #realizer: Realizer;
  readonly #registry: Registry;

  constructor(realizer: Realizer, registrations: Iterable<Registration<unknown>>) {
    this.#realizer = realizer;
    this.#registry = new Registry(registrations);
  }

  /** @throws {UnsatisfiableError} when nothing in the registry can produce {@link address}. */
  resolve(address: Type, context: ResolveContext): unknown {
    return Plan.realize(Plan.from(address, this.#registry), { engine: this, serviceProvider: context.serviceProvider, realizer: this.#realizer });
  }

  /**
   * An invocation frame: `registration` is the ready-made answer for its own service type, its
   * dependencies resolve from the registry, and the plan is per-call — nothing registers and
   * nothing caches.
   *
   * @throws {UnsatisfiableError} when no signature of {@link registration} can be satisfied.
   */
  resolveFrame(registration: Registration<unknown>, serviceProvider: IServiceProvider): unknown {
    const plan = Plan.fromRegistration(registration, this.#registry);
    if (plan === undefined) {
      throw new UnsatisfiableError(registration.address, 'no signature of the invoked callable can be satisfied');
    }
    return Plan.realize(plan, { engine: this, serviceProvider, realizer: this.#realizer });
  }

  /**
   * A latebound call: the first signature the call's arity satisfies binds each arg to the
   * slots naming its type, and the args ride the realize context into the plan's
   * {@link Plan.arg} sites. A call may stop short of a signature's full length exactly where
   * the slots it leaves unfilled admit `undefined` — an omitted optional arrives as the
   * `undefined` the slot's own type already names.
   */
  resolveLatebound(funcType: FunctionType, providedArgs: readonly unknown[], serviceProvider: IServiceProvider): unknown {
    const signature = funcType.signatures
      .filter(candidateSignature => providedArgs.length <= candidateSignature.length)
      .find(candidate => candidate.slice(providedArgs.length).every(Type.isOptional));

    if (signature === undefined) {
      throw new TypeError(`${Type.stringify(funcType)} has no signature accepting ${providedArgs.length} arg(s)`);
    }
    const result = Plan.from(funcType.return, this.#registry, signature);
    return Plan.realize(result, {
      engine: this,
      serviceProvider,
      realizer: this.#realizer,
      args: providedArgs,
    });
  }

  /**
   * Builds a plan for every closed registration up front, collecting each failure instead of
   * stopping at the first, so one pass reports the whole broken graph.
   *
   * @throws {ManifestValidationError} when any registration has no plan.
   */
  validate(): void {
    const failures = Iterator.from(this.#registry.closedAddresses)
      .map((address): ValidationFailure | undefined => {
        try {
          Plan.from(address, this.#registry);
          return undefined;
        } catch (error) {
          return { address, error: error instanceof Error ? error : new Error(String(error)) };
        }
      })
      .filter((failure): failure is ValidationFailure => failure !== undefined)
      .toArray();
    if (failures.length) {
      throw new ManifestValidationError(failures);
    }
  }
}
