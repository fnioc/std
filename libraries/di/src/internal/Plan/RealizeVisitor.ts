import { type Construction, type Hooks, type IServiceProvider, Registration, type Starfish } from '@rhombus-std/di.core';
import type { Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Ctor, Func } from '@rhombus-toolkit/func';
import { assertNever } from '@rhombus-toolkit/type-guards';
import type { Engine } from '../Engine.js';
import type { ArrayPlan, ConstantPlan, CtorPlan, FactoryPlan, InvokerPlan, IterablePlan, LateBoundArgPlan, LateBoundPlan, Plan, RegisteredCtorPlan, RegisteredFactoryPlan, ServiceProviderPlan,
  StarfishPlan } from './Plan.js';

export interface RealizeOptions {
  readonly engine: Engine;
  /** The facade a slot naming `IServiceProvider` falls back to — the provider this resolution was asked of. */
  readonly serviceProvider: IServiceProvider;
  /** The context this resolution's constructions sit under, as it opened. */
  readonly context?: unknown;
  /** A latebound call's arguments, read by position from the {@link LateBoundArgPlan}s in its plan. */
  readonly args?: readonly unknown[];
}

/**
 * Realizes a {@link Plan} tree into the value it describes.
 *
 * @remarks
 * One instance per walk, entered through {@link realizePlan}. One context value descends with the
 * walk — opaque to everything here, moved and never read.
 */
class RealizeVisitor {
  readonly #engine: Engine;
  readonly #serviceProvider: IServiceProvider;
  readonly #hooks: Hooks;
  readonly #args: readonly unknown[] | undefined;

  constructor({ engine, serviceProvider, args }: RealizeOptions) {
    this.#engine = engine;
    this.#serviceProvider = serviceProvider;
    this.#hooks = engine.hooks;
    this.#args = args;
  }

  visit(plan: Plan, context: unknown): any {
    switch (plan.kind) {
      case 'registered-ctor':
        return this.visitRegisteredCtor(plan, context);
      case 'registered-factory':
        return this.visitRegisteredFactory(plan, context);
      case 'ctor':
        return this.visitCtor(plan, context);
      case 'factory':
        return this.visitFactory(plan, context);
      case 'latebound':
        return this.visitLateBound(plan, context);
      case 'latebound-arg':
        return this.visitLateBoundArg(plan);
      case 'invoker':
        return this.visitInvoker(plan, context);
      case 'constant':
        return this.visitConstant(plan);
      case 'service-provider':
        return this.visitServiceProvider(plan, context);
      case 'starfish':
        return this.visitStarfish(plan, context);
      case 'iterable':
        return this.visitIterable(plan, context);
      case 'array':
        return this.visitArray(plan, context);
      default:
        return assertNever(plan);
    }
  }

  protected visitRegisteredCtor(plan: RegisteredCtorPlan, context: unknown): any {
    return this.#realize(plan, plan.populatedAddress, plan.registration, context, within => new plan.ctor(...plan.args.map(arg => this.visit(arg, within))));
  }

  protected visitRegisteredFactory(plan: RegisteredFactoryPlan, context: unknown): any {
    return this.#realize(plan, plan.populatedAddress, plan.registration, context, within => plan.factory(...plan.args.map(arg => this.visit(arg, within))));
  }

  /**
   * Constructs through the engine's one handler: an `{instance}` answer is the node's value,
   * built by nobody and swept by nothing, while a `{within}` answer is the context this node's
   * dependencies resolve under. What is built is canonicalized, and the node settles on whatever
   * that answered before anything downstream reads it.
   */
  #realize(plan: Plan, populatedAddress: Type, registration: Registration<unknown> | undefined, context: unknown, make: Func<[unknown], unknown>): any {
    const construction: Construction = { site: plan, populatedAddress, registration, context };
    const answer = this.#hooks.beforeConstruct(construction);
    if ('instance' in answer) {
      return answer.instance;
    }
    const instance = this.#hooks.canonicalize(construction, make(answer.within));
    this.#hooks.afterConstruct(construction, instance);
    return instance;
  }

  protected visitCtor(plan: CtorPlan, context: unknown): any {
    return new plan.ctor(...plan.args.map(arg => this.visit(arg, context)));
  }

  protected visitFactory(plan: FactoryPlan, context: unknown): any {
    return plan.factory(...plan.args.map(arg => this.visit(arg, context)));
  }

  /**
   * Each call re-enters under the context at the position the function was minted — the model's
   * `{within}` re-threading makes that position's context the honest ownership context: a
   * singleton's factory carries the root-threaded context, a scoped service's factory carries its
   * own owning context.
   */
  protected visitLateBound(plan: LateBoundPlan, context: unknown): any {
    return (...args: any[]) => this.#engine.resolveLatebound(plan.funcType, args, { serviceProvider: this.#serviceProvider, context });
  }

  protected visitLateBoundArg(plan: LateBoundArgPlan): any {
    return this.#args![plan.index];
  }

  /**
   * The closure `resolve(callableType, callable)` hands back: each call synthesizes a throwaway
   * registration for the caller's own `callable`, under `callableType` itself as the address, and
   * hands it to the engine as an invocation frame — nothing here is registered or cached.
   */
  protected visitInvoker(plan: InvokerPlan, context: unknown): any {
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
      return this.#engine.resolveFrame(registration, { serviceProvider: this.#serviceProvider, context });
    };
  }

  protected visitConstant(plan: ConstantPlan): any {
    return plan.value;
  }

  /**
   * The provider a slot naming `IServiceProvider` resolves to: whoever answers this construction —
   * the lifetime model, structurally, for the context enclosing it — falling back to the provider
   * this resolution was asked of when nothing answers.
   */
  protected visitServiceProvider(plan: ServiceProviderPlan, context: unknown): any {
    return this.#realize(plan, typefor<IServiceProvider>(), undefined, context, () => this.#serviceProvider);
  }

  /**
   * The engine's own door — one object, whoever asks for it. The handler sees the ask like any
   * construction, with no registration behind it, so a dependency-position door is catchable, and
   * suppliable, by whoever holds a hook.
   */
  protected visitStarfish(plan: StarfishPlan, context: unknown): any {
    return this.#realize(plan, typefor<Starfish>(), undefined, context, () => this.#engine.starfish);
  }

  /**
   * @remarks
   * Re-iterable rather than a one-shot iterator: a caller that walks it twice gets a value both
   * times. Each walk realizes afresh, so a transient member is a new instance per pass.
   */
  protected visitIterable(plan: IterablePlan, context: unknown): any {
    return { [Symbol.iterator]: () => Iterator.from(plan.types).map(inner => this.visit(inner, context)) };
  }

  protected visitArray(plan: ArrayPlan, context: unknown): any {
    return plan.types.map(inner => this.visit(inner, context));
  }
}

/** Realizes {@link plan} into its value; the walk is synchronous throughout. */
export function realizePlan(plan: Plan, options: RealizeOptions): any {
  return new RealizeVisitor(options).visit(plan, options.context);
}
