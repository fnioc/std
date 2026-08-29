import { Behavior, Control, Hooks, type IEngineHooks, type IServiceProviderInternal, type Registration, UnknownControlError, UnsatisfiableError } from '@rhombus-std/di.core';
import { assertTruthy, type FunctionType, Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';
import { isControlAsk } from './control-recognition.js';
import { Plan } from './Plan/index.js';
import { Registry } from './Registry.js';

/** A resolution as it stood where a callable was minted, so invoking that callable re-enters the same way. */
interface RunningResolve {
  /** The one handler the resolution was running through. */
  readonly hooks: Hooks;
  /** The state at the position the callable was minted. */
  readonly state: unknown;
}

export interface Engine extends IServiceProviderInternal {}

/** The resolution orchestrator: one per container. Also the chain's terminus — a bare engine is itself a fully working, transient-only provider. */
export class Engine implements IServiceProviderInternal, IEngineHooks {
  readonly #registry: Registry;
  /**
   * Every hook layer installed and not yet disposed, oldest first; starts empty. Each layer is the
   * chain standing outside whatever it's handed, held here by identity — the token `useHooks`'s
   * disposer looks up to remove exactly the one it installed and no other.
   */
  readonly #installed: Array<Func<[inner: Hooks], Hooks>> = [];

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
    assertTruthy(address, 'the service type handed to the engine');
    // A provider offers one door, so what the providers of this package work the engine through is
    // asked for the same way anything else is: as a control, answered here and held by whoever asked.
    if (address === typefor<Control<IEngineHooks>>()) {
      return new Control(this);
    }
    // What an addon's own middleware validates its manifest against at build, before anything
    // else can have registered or resolved.
    if (address === typefor<Control<Iterable<Registration<unknown>>>>()) {
      return new Control(this.#registry.registrations);
    }
    if (isControlAsk(address)) {
      throw new UnknownControlError(address);
    }
    // The most recently installed layer stands closest to the walk, so a bracket's keeping seeds
    // the state before anything installed earlier reads it — which is what makes a unit of work
    // opened inside another answer from its own scope. An install made during a resolution affects
    // only resolutions opened after it: a resolution already under way keeps what it opened with,
    // its latebound closures included, however late they fire.
    const hooks = this.#installed.reduceRight((inner, layer) => layer(inner), Hooks.identity);
    return Plan.realize(Plan.from(address, this.#registry), {
      engine: this,
      hooks,
      state: hooks.beginResolve(address, undefined),
    });
  }

  // #endregion

  // #region IEngineHooks

  useHooks<State = unknown>(hooks: Behavior<State>): Disposable {
    const layer: Func<[inner: Hooks], Hooks> = inner => Behavior.compose(hooks, inner);
    this.#installed.push(layer);
    return {
      [Symbol.dispose]: () => {
        const at = this.#installed.lastIndexOf(layer);
        if (at >= 0) {
          this.#installed.splice(at, 1);
        }
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
   * An invocation frame for `registration`: dependencies resolve from the registry, but nothing
   * registers or caches.
   *
   * @param running - the resolution as it stood where the caller was minted; it re-opens through
   * that resolution's own handler, so an opener that reads ambient state can override the state
   * captured there.
   * @throws {UnsatisfiableError} when no signature of {@link registration} can be satisfied.
   */
  resolveFrame(registration: Registration<unknown>, running: RunningResolve): unknown {
    const plan = Plan.fromRegistration(registration, this.#registry);
    if (plan === undefined) {
      throw new UnsatisfiableError(registration.address, 'no signature of the invoked callable can be satisfied');
    }
    return Plan.realize(plan, {
      engine: this,
      hooks: running.hooks,
      state: running.hooks.beginResolve(registration.address, running.state),
    });
  }

  /**
   * A latebound call: binds each arg to the first signature whose arity fits, positionally.
   * A call may stop short of the full signature wherever the remaining slots admit `undefined`.
   *
   * @param running - the resolution as it stood where the caller was minted; it re-opens through
   * that resolution's own handler, so an opener that reads ambient state can override the state
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
      hooks: running.hooks,
      state: running.hooks.beginResolve(funcType.return, running.state),
      args: providedArgs,
    });
  }

  // #endregion
}
