import { type Behavior, Control, HookChain, type IEngineHooks, type IServiceProviderInternal, type Registration, UnknownControlError, UnsatisfiableError } from '@rhombus-std/di.core';
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
}

/**
 * The state every behavior on `chain` opens `request` under, one slot apiece: each files into its
 * own, seeded from `injected` — so a slot nobody writes keeps whatever the caller carried in.
 */
function openStates(chain: HookChain, request: Type, injected: readonly unknown[]): readonly unknown[] {
  const opening = injected.slice();
  chain.beginResolve(request, injected, opening);
  return Object.freeze(opening);
}

export interface Engine extends IServiceProviderInternal {}

/** The resolution orchestrator: one per container. Also the chain's terminus — a bare engine is itself a fully working, transient-only provider. */
export class Engine implements IServiceProviderInternal, IEngineHooks {
  readonly #registry: Registry;
  /** Everything installed and not yet disposed, the most recently installed standing nearest the walk. */
  #chain: HookChain = HookChain.identity;
  /** The slots of behaviors since disposed, handed out again before the chain is widened. */
  readonly #freeSlots: number[] = [];

  constructor(registrations: Iterable<Registration<unknown>>) {
    this.#registry = new Registry(registrations);
  }

  // #region IServiceProviderInternal

  /**
   * Resolves `address` under everything installed and not yet disposed.
   *
   * @remarks
   * A control ask is answered here and nowhere else: the engine hands back what it names itself,
   * running no hook and standing nothing over anything, so reaching for a control changes nothing
   * about the resolution that follows.
   *
   * @throws {UnsatisfiableError} when nothing in the registry can produce {@link address}.
   * @throws {UnknownControlError} when a control ask names something the engine cannot answer.
   */
  getService(address: Type): any {
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

    return Plan.realize(Plan.from(address, this.#registry), {
      engine: this,
      chain: this.#chain,
      context: { states: openStates(this.#chain, address, new Array(this.#chain.width)) },
    });
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
      context: { states: openStates(running.chain, registration.address, running.context.states) },
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
        states: openStates(running.chain, funcType.return, running.context.states),
        args: providedArgs,
      },
    });
  }

  // #endregion
}
