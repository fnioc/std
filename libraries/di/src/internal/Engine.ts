import { type Hooks, type IServiceProvider, type Registration, type Starfish, UnsatisfiableError } from '@rhombus-std/di.core';
import { augment, type FunctionType, Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import { HookComposer } from './HookComposer.js';
import { Plan } from './Plan/index.js';
import { Registry } from './Registry.js';

/** Who a resolution is answered by, and the context it runs under. */
export interface ResolveContext {
  /** What a service asking for the provider receives when its model has none of its own to hand out. */
  readonly serviceProvider: IServiceProvider;
  /** The context the resolution's constructions sit under, absent to run it under none. */
  readonly context?: unknown;
}

export interface Engine extends IServiceProvider {}

/** The resolution orchestrator: one per container. Also the chain's terminus — a bare engine is itself a fully working, transient-only provider. */
@augment(typefor<IServiceProvider>())
export class Engine implements IServiceProvider {
  readonly #registry: Registry;
  readonly #composer = new HookComposer();
  #starfish: Starfish | undefined;

  constructor(registrations: Iterable<Registration<unknown>>) {
    this.#registry = new Registry(registrations);
  }

  getService(address: Type): any {
    if (!address) {
      throw new TypeError('getService was handed a nullish service type.');
    }
    return this.resolveUnder(address, { serviceProvider: this });
  }

  /** The registrations this engine resolves against. */
  get registry(): Registry {
    return this.#registry;
  }

  /** The one handler every resolution runs through, as everything filed through the door composes. */
  get hooks(): Hooks {
    return this.#composer.hooks;
  }

  /** The one door this engine answers `Starfish` with, minted on the first ask and shared by every later one. */
  get starfish(): Starfish {
    return this.#starfish ??= {
      bind: binding => {
        const { provider, context } = binding;
        return request => this.resolveUnder(request, { serviceProvider: provider ?? this, context });
      },
      onBeginResolve: fn => this.#composer.onBeginResolve(fn),
      onBeforeConstruct: (fn, options) => this.#composer.onBeforeConstruct(fn, options),
      onCanonicalize: (fn, options) => this.#composer.onCanonicalize(fn, options),
      onAfterConstruct: (fn, options) => this.#composer.onAfterConstruct(fn, options),
    };
  }

  /**
   * Resolves `address`, opening the resolution under whatever `injection` carried.
   *
   * @throws {UnsatisfiableError} when nothing in the registry can produce {@link address}.
   */
  resolveUnder(address: Type, injection: ResolveContext): unknown {
    return Plan.realize(Plan.from(address, this.#registry), {
      engine: this,
      serviceProvider: injection.serviceProvider,
      context: this.hooks.beginResolve(address, injection.context),
    });
  }

  /**
   * An invocation frame for `registration`: dependencies resolve from the registry, but nothing
   * registers or caches.
   *
   * @param running - the context captured where the caller was minted; the resolution re-opens
   * through the handler so an opener that reads ambient state can override it.
   * @throws {UnsatisfiableError} when no signature of {@link registration} can be satisfied.
   */
  resolveFrame(registration: Registration<unknown>, running: ResolveContext): unknown {
    const plan = Plan.fromRegistration(registration, this.#registry);
    if (plan === undefined) {
      throw new UnsatisfiableError(registration.address, 'no signature of the invoked callable can be satisfied');
    }
    return Plan.realize(plan, { engine: this, ...running, context: this.hooks.beginResolve(registration.address, running.context) });
  }

  /**
   * A latebound call: binds each arg to the first signature whose arity fits, positionally.
   * A call may stop short of the full signature wherever the remaining slots admit `undefined`.
   *
   * @param running - the context captured where the caller was minted; the resolution re-opens
   * through the handler so an opener that reads ambient state can override it.
   */
  resolveLatebound(funcType: FunctionType, providedArgs: readonly unknown[], running: ResolveContext): unknown {
    const signature = funcType.signatures
      .filter(candidateSignature => providedArgs.length <= candidateSignature.length)
      .find(candidate => candidate.slice(providedArgs.length).every(Type.isOptional));

    if (signature === undefined) {
      throw new TypeError(`${Type.stringify(funcType)} has no signature accepting ${providedArgs.length} arg(s)`);
    }
    const result = Plan.from(funcType.return, this.#registry, signature);
    return Plan.realize(result, {
      engine: this,
      ...running,
      context: this.hooks.beginResolve(funcType.return, running.context),
      args: providedArgs,
    });
  }
}
