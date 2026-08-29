import { type Hooks, type IServiceProvider, Registration } from '@rhombus-std/di.core';
import type { Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Ctor, Func } from '@rhombus-toolkit/func';
import { assertNever } from '@rhombus-toolkit/type-guards';
import { ServiceProvider } from '../../ServiceProvider.js';
import type { Engine } from '../Engine.js';
import type { ArrayPlan, ConstantPlan, CtorPlan, FactoryPlan, InvokerPlan, IterablePlan, LateBoundArgPlan, LateBoundPlan, Plan, RegisteredCtorPlan, RegisteredFactoryPlan,
  ServiceProviderPlan } from './Plan.js';

export interface RealizeOptions {
  readonly engine: Engine;
  /** The one handler this resolution runs through, as its behaviors aggregated where it opened. */
  readonly hooks: Hooks;
  /** The state this resolution's constructions sit under, as it opened. */
  readonly state?: unknown;
  /** A latebound call's arguments, read by position from the {@link LateBoundArgPlan}s in its plan. */
  readonly args?: readonly unknown[];
}

/**
 * Realizes a {@link Plan} tree into the value it describes.
 *
 * @remarks
 * One instance per walk, entered through {@link realizePlan}. One state value descends with the
 * walk — opaque to everything here, moved and never read.
 */
class RealizeVisitor {
  readonly #engine: Engine;
  readonly #hooks: Hooks;
  readonly #args: readonly unknown[] | undefined;

  constructor({ engine, hooks, args }: RealizeOptions) {
    this.#engine = engine;
    this.#hooks = hooks;
    this.#args = args;
  }

  visit(plan: Plan, state: unknown): any {
    switch (plan.kind) {
      case 'registered-ctor':
        return this.visitRegisteredCtor(plan, state);
      case 'registered-factory':
        return this.visitRegisteredFactory(plan, state);
      case 'ctor':
        return this.visitCtor(plan, state);
      case 'factory':
        return this.visitFactory(plan, state);
      case 'latebound':
        return this.visitLateBound(plan, state);
      case 'latebound-arg':
        return this.visitLateBoundArg(plan);
      case 'invoker':
        return this.visitInvoker(plan, state);
      case 'constant':
        return this.visitConstant(plan);
      case 'service-provider':
        return this.visitServiceProvider(plan, state);
      case 'iterable':
        return this.visitIterable(plan, state);
      case 'array':
        return this.visitArray(plan, state);
      default:
        return assertNever(plan);
    }
  }

  protected visitRegisteredCtor(plan: RegisteredCtorPlan, state: unknown): any {
    return this.#realize(plan, plan.populatedAddress, plan.registration, state, within => new plan.ctor(...plan.args.map(arg => this.visit(arg, within))));
  }

  protected visitRegisteredFactory(plan: RegisteredFactoryPlan, state: unknown): any {
    return this.#realize(plan, plan.populatedAddress, plan.registration, state, within => plan.factory(...plan.args.map(arg => this.visit(arg, within))));
  }

  /**
   * Constructs through the engine's one handler: a `{result}` answer is the node's value,
   * built by nobody and swept by nothing, while a `{state}` answer is the state this node's
   * dependencies resolve under. What is built is canonicalized, and the node settles on whatever
   * that answered before anything downstream reads it.
   */
  #realize(plan: Plan, populatedAddress: Type, registration: Registration<unknown> | undefined, state: unknown, make: Func<[unknown], unknown>): any {
    const construction: Hooks.Construction = { site: plan, populatedAddress, registration, state };
    const answer = this.#hooks.beforeConstruct(construction);
    if ('result' in answer) {
      return answer.result;
    }
    const instance = this.#hooks.canonicalize(construction, make(answer.state));
    this.#hooks.afterConstruct(construction, instance);
    return instance;
  }

  protected visitCtor(plan: CtorPlan, state: unknown): any {
    return new plan.ctor(...plan.args.map(arg => this.visit(arg, state)));
  }

  protected visitFactory(plan: FactoryPlan, state: unknown): any {
    return plan.factory(...plan.args.map(arg => this.visit(arg, state)));
  }

  /**
   * Each call re-enters under the state at the position the function was minted — the model's
   * `{state}` re-threading makes that position's state the honest ownership state: a
   * singleton's factory carries the root-threaded state, a scoped service's factory carries its
   * own owning state.
   */
  protected visitLateBound(plan: LateBoundPlan, state: unknown): any {
    return (...args: any[]) => this.#engine.resolveLatebound(plan.funcType, args, { hooks: this.#hooks, state });
  }

  protected visitLateBoundArg(plan: LateBoundArgPlan): any {
    return this.#args![plan.index];
  }

  /**
   * The closure `resolve(callableType, callable)` hands back: each call synthesizes a throwaway
   * registration for the caller's own `callable`, under `callableType` itself as the address, and
   * hands it to the engine as an invocation frame — nothing here is registered or cached.
   */
  protected visitInvoker(plan: InvokerPlan, state: unknown): any {
    const { callableType } = plan;
    return (callable: Ctor | Func) => {
      const registration = (() => {
        switch (callableType.kind) {
          case 'ctor':
            return Registration.ctor(callableType, callable as Ctor, callableType);
          case 'func':
            return Registration.factory(callableType, callable as Func, callableType);
          default:
            return assertNever(callableType);
        }
      })();
      return this.#engine.resolveFrame(registration, { hooks: this.#hooks, state });
    };
  }

  protected visitConstant(plan: ConstantPlan): any {
    return plan.value;
  }

  /**
   * The provider a slot naming `IServiceProvider` resolves to: whoever answers this construction —
   * the lifetime model, structurally, for the state enclosing it — falling back to a fresh augmented
   * wrap of the engine itself when nothing answers. Minted just-in-time, not cached: no provider
   * object carries an identity guarantee.
   */
  protected visitServiceProvider(plan: ServiceProviderPlan, state: unknown): any {
    return this.#realize(plan, typefor<IServiceProvider>(), undefined, state, () => new ServiceProvider(this.#engine));
  }

  /**
   * @remarks
   * Re-iterable rather than a one-shot iterator: a caller that walks it twice gets a value both
   * times. Each walk realizes afresh, so a transient member is a new instance per pass.
   */
  protected visitIterable(plan: IterablePlan, state: unknown): any {
    return { [Symbol.iterator]: () => Iterator.from(plan.types).map(inner => this.visit(inner, state)) };
  }

  protected visitArray(plan: ArrayPlan, state: unknown): any {
    return plan.types.map(inner => this.visit(inner, state));
  }
}

/** Realizes {@link plan} into its value; the walk is synchronous throughout. */
export function realizePlan(plan: Plan, options: RealizeOptions): any {
  return new RealizeVisitor(options).visit(plan, options.state);
}
