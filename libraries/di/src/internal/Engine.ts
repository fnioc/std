import { type LifetimeModel, ManifestValidationError, type ServiceDescriptor, UnsatisfiableError, type ValidationFailure } from '@rhombus-std/di.core';
import { type FunctionType, type IServiceProvider, Type } from '@rhombus-std/primitives';
import { CallSite } from './CallSite/index.js';
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
  readonly #lifetimeModel: LifetimeModel;
  readonly #registry: Registry;

  constructor(lifetimeModel: LifetimeModel, descriptors: Iterable<ServiceDescriptor<unknown>>) {
    this.#lifetimeModel = lifetimeModel;
    this.#registry = new Registry(descriptors);
  }

  /** @throws {UnsatisfiableError} when nothing in the registry can produce {@link serviceType}. */
  resolve(serviceType: Type, context: ResolveContext): unknown {
    return CallSite.realize(CallSite.from(serviceType, this.#registry), { engine: this, serviceProvider: context.serviceProvider, lifetimeModel: this.#lifetimeModel });
  }

  /**
   * An invocation frame: `descriptor` is the ready-made answer for its own service type, its
   * dependencies resolve from the registry, and the plan is per-call — nothing registers and
   * nothing caches.
   *
   * @throws {UnsatisfiableError} when no signature of {@link descriptor} can be satisfied.
   */
  resolveFrame(descriptor: ServiceDescriptor<unknown>, serviceProvider: IServiceProvider): unknown {
    const site = CallSite.fromDescriptor(descriptor, this.#registry);
    if (site === undefined) {
      throw new UnsatisfiableError(descriptor.serviceType, 'no signature of the invoked callable can be satisfied');
    }
    return CallSite.realize(site, { engine: this, serviceProvider, lifetimeModel: this.#lifetimeModel });
  }

  /**
   * A latebound call: the first signature the call's arity satisfies binds each arg to the
   * slots naming its type, and the args ride the realize context into the plan's
   * {@link CallSite.arg} sites. A call may stop short of a signature's full length exactly where
   * the slots it leaves unfilled admit `undefined` — an omitted optional arrives as the
   * `undefined` the slot's own type already names.
   */
  resolveLatebound(funcType: FunctionType, args: readonly unknown[], serviceProvider: IServiceProvider): unknown {
    const signature = funcType.signatures.find(candidate =>
      args.length <= candidate.length
      && candidate.slice(args.length).every(Type.isOptional)
    );
    if (signature === undefined) {
      throw new TypeError(`${Type.stringify(funcType)} has no signature accepting ${args.length} arg(s)`);
    }
    return CallSite.realize(CallSite.from(funcType.return, this.#registry, signature), {
      engine: this,
      serviceProvider,
      lifetimeModel: this.#lifetimeModel,
      args,
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
      .map((serviceType): ValidationFailure | undefined => {
        try {
          CallSite.from(serviceType, this.#registry);
          return undefined;
        } catch (error) {
          return { serviceType, error: error instanceof Error ? error : new Error(String(error)) };
        }
      })
      .filter((failure): failure is ValidationFailure => failure !== undefined)
      .toArray();
    if (failures.length) {
      throw new ManifestValidationError(failures);
    }
  }
}
