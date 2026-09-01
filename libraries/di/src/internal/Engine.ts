import { type Behavior, Control, controlLifetime, HookChain, type IEngineHooks, type Registration, type Request, UnknownControlError, UnsatisfiableError } from '@rhombus-std/di.core';
import { type FunctionType, Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import { isControlAsk } from './control-recognition.js';
import { Plan, type VisitorContext } from './Plan/index.js';
import { Registry } from './Registry.js';

/** A resolution as it stood where a callable was minted, so invoking that callable re-enters the same way. */
interface RunningResolve {
  /** The one chain the resolution was running through. */
  readonly chain: HookChain;
  /** What the walk carried at the position the callable was minted, everything an enclosing boundary settled stripped off. */
  readonly context: VisitorContext;
  /** The request that opened the ask this callable was minted under. */
  readonly request: Request;
}

/**
 * The state every behavior on `chain` opens `request` under, one slot apiece: each files into its
 * own, seeded from `injected` — so a slot nobody writes keeps whatever the caller carried in.
 */
function openStates(chain: HookChain, request: Request, injected: readonly unknown[]): readonly unknown[] {
  const opening = injected.slice();
  chain.beginResolve(request, injected, opening);
  return Object.freeze(opening);
}

/** The resolution orchestrator: one per container. Composed as the innermost middleware element. */
export class Engine implements IEngineHooks {
  readonly #registry: Registry;
  /** Addresses whose registrations carry the engine-owned {@link controlLifetime}, precomputed at construction. */
  readonly #controlLifetimeAddresses: ReadonlySet<Type>;
  /** Everything installed and not yet disposed, the most recently installed standing nearest the walk. */
  #chain: HookChain = HookChain.identity;
  /** The slots of behaviors since disposed, handed out again before the chain is widened. */
  readonly #freeSlots: number[] = [];

  constructor(registrations: Iterable<Registration<unknown>>) {
    this.#registry = new Registry(registrations);
    this.#controlLifetimeAddresses = new Set(
      Iterator.from(this.#registry.registrations)
        .filter(r => 'lifetime' in r && r.lifetime === controlLifetime)
        .map(r => r.address),
    );
  }

  // #region resolution

  /**
   * Resolves `request` under everything installed and not yet disposed.
   *
   * @remarks
   * A control ask is answered here and nowhere else: the engine hands back what it names itself,
   * running no hook and standing nothing over anything, so reaching for a control changes nothing
   * about the resolution that follows.
   *
   * A registration carrying {@link controlLifetime} is answered directly — its factory receives
   * the request and nothing else, bypassing the plan infrastructure and the hook chain.
   *
   * @throws {UnsatisfiableError} when nothing in the registry can produce the requested address.
   * @throws {UnknownControlError} when a control ask names something the engine cannot answer.
   */
  getService(request: Request): any {
    const address = request.type;
    switch (address) {
      case undefined:
        throw new TypeError('getService received no address — the caller resolved without a service type');
      case typefor<Control<IEngineHooks>>():
        return new Control(this);
      case typefor<Control<Iterable<Registration<unknown>>>>(): {
        return new Control(this.#registry.registrations);
      }
      default: {
        if (isControlAsk(address)) {
          throw new UnknownControlError(address);
        }
      }
    }

    if (this.#controlLifetimeAddresses.has(address)) {
      return this.#resolveControlLifetime(request);
    }

    return Plan.realize(Plan.from(address, this.#registry), {
      engine: this,
      chain: this.#chain,
      context: { states: openStates(this.#chain, request, new Array(this.#chain.width)) },
      request,
    });
  }

  /**
   * Answers a {@link controlLifetime} registration directly: the factory receives the request
   * with no planning, no hooks, and no caching.
   */
  #resolveControlLifetime(request: Request): unknown {
    const match = this.#registry.getMatches(request.type).find(Boolean);
    if (!match) {
      throw new UnsatisfiableError(request.type, 'control-lifetime address has no registration');
    }
    const { registration } = match;
    if ('factory' in registration) {
      return registration.factory(request);
    }
    if ('value' in registration) {
      return registration.value;
    }
    throw new TypeError(`control-lifetime registration for ${Type.stringify(request.type)} has an unsupported implementer kind`);
  }

  // #endregion

  // #region IEngineHooks

  useHooks<State = unknown>(hooks: Behavior<State>): Disposable {
    const slot = this.#freeSlots.pop() ?? this.#chain.width;
    const beneath = this.#chain;
    const standing = beneath.with(hooks, slot);
    this.#chain = standing;
    let live = true;
    return {
      [Symbol.dispose]: () => {
        if (!live) {
          return;
        }
        live = false;
        // Uninstalling the most recent install is the chain from before it; anything else has to
        // answer a chain the layers installed since still stand in.
        this.#chain = this.#chain === standing ? beneath : this.#chain.without(slot);
        this.#freeSlots.push(slot);
      },
    };
  }

  // #endregion

  // #region internals

  /** The registrations this engine resolves against. */
  get registry(): Registry {
    return this.#registry;
  }

  /**
   * @param running - the resolution as it stood where the caller was created.
   * @throws {UnsatisfiableError} when no signature of {@link registration} can be satisfied.
   */
  resolveFrame(registration: Registration<unknown>, running: RunningResolve): unknown {
    const plan = Plan.fromRegistration(registration, this.#registry);
    if (plan === undefined) {
      throw new UnsatisfiableError(registration.address, 'no signature of the invoked callable can be satisfied');
    }
    return Plan.realize(plan, {
      engine: this,
      chain: running.chain,
      context: { states: openStates(running.chain, running.request, running.context.states) },
      request: running.request,
    });
  }

  /**
   * A latebound call: binds each arg to the first signature whose arity fits, positionally.
   * A call may stop short of the full signature wherever the remaining slots admit `undefined`.
   *
   * @param running - the resolution as it stood where the caller was minted; it re-opens through
   * that resolution's own chain, so an opener that reads ambient state can override the state
   * captured there.
   */
  resolveLatebound(funcType: FunctionType, providedArgs: readonly unknown[], running: RunningResolve): unknown {
    const signature = funcType.signatures
      .filter(candidateSignature => providedArgs.length <= candidateSignature.length)
      .find(candidate => candidate.slice(providedArgs.length).every(Type.isOptional));

    if (signature === undefined) {
      throw new TypeError(`${Type.stringify(funcType)} has no signature accepting ${providedArgs.length} arg(s)`);
    }
    return Plan.realize(Plan.from(funcType.return, this.#registry, signature), {
      engine: this,
      chain: running.chain,
      context: {
        states: openStates(running.chain, running.request, running.context.states),
        args: providedArgs,
      },
      request: running.request,
    });
  }

  // #endregion
}
