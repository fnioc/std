import { type IServiceProvider, LifetimeModelError, type Realizer, Registration } from '@rhombus-std/di.core';
import type { Ctor, Func } from '@rhombus-toolkit/func';
import { assertNever } from '@rhombus-toolkit/type-guards';
import type { Engine } from '../Engine.js';
import type { ArrayPlan, ConstantPlan, CtorPlan, FactoryPlan, InvokerPlan, IterablePlan, LateBoundArgPlan, LateBoundPlan, Plan, RegisteredCtorPlan, RegisteredFactoryPlan,
  ServiceProviderPlan } from './Plan.js';

export interface RealizeOptions {
  readonly engine: Engine;
  /** What a service asking for the provider receives — the walk's originating facade. */
  readonly serviceProvider: IServiceProvider;
  /** The realizer governing the walk's root plan. */
  readonly realizer: Realizer;
  /** A latebound call's arguments, read by position from the {@link LateBoundArgPlan}s in its plan. */
  readonly args?: readonly unknown[];
}

/**
 * Realizes a {@link Plan} tree into the value it describes.
 *
 * @remarks
 * One instance per walk — {@link realizePlan} is the entry point. `ctor` and `factory`
 * nodes realize their argument sites depth-first; a `latebound` node realizes to a function
 * that re-enters the engine on every call, the call's arguments entering as value
 * registrations; the leaf kinds read the walk-wide {@link RealizeOptions} fixed at
 * construction.
 */
class RealizeVisitor {
  readonly #engine: Engine;
  readonly #serviceProvider: IServiceProvider;
  readonly #args: readonly unknown[] | undefined;

  constructor({ engine, serviceProvider, args }: Omit<RealizeOptions, 'realizer'>) {
    this.#engine = engine;
    this.#serviceProvider = serviceProvider;
    this.#args = args;
  }

  visit(plan: Plan, realizer: Realizer): any {
    switch (plan.kind) {
      case 'registered-ctor':
        return this.visitRegisteredCtor(plan, realizer);
      case 'registered-factory':
        return this.visitRegisteredFactory(plan, realizer);
      case 'ctor':
        return this.visitCtor(plan, realizer);
      case 'factory':
        return this.visitFactory(plan, realizer);
      case 'latebound':
        return this.visitLateBound(plan);
      case 'latebound-arg':
        return this.visitLateBoundArg(plan);
      case 'invoker':
        return this.visitInvoker(plan);
      case 'constant':
        return this.visitConstant(plan);
      case 'service-provider':
        return this.visitServiceProvider(plan);
      case 'iterable':
        return this.visitIterable(plan, realizer);
      case 'array':
        return this.visitArray(plan, realizer);
      default:
        return assertNever(plan);
    }
  }

  protected visitRegisteredCtor(plan: RegisteredCtorPlan, realizer: Realizer): any {
    return this.#realize(plan, realizer, (...args) => new plan.ctor(...args));
  }

  protected visitRegisteredFactory(plan: RegisteredFactoryPlan, realizer: Realizer): any {
    return this.#realize(plan, realizer, plan.factory);
  }

  /**
   * Calls the realizer with the throw attributed: an error raised by the realizer's own code
   * surfaces as {@link LifetimeModelError} naming the plan, while an error `make` raised passes
   * through untouched — the construction, not the realizer, owns that one.
   */
  #realize(plan: RegisteredCtorPlan | RegisteredFactoryPlan, realizer: Realizer, factory: Func): any {
    let madeThrew = false;
    let madeError: unknown;
    try {
      return realizer.realize({
        site: plan,
        populatedAddress: plan.populatedAddress,
        registration: plan.registration,
        make: descendantRealizer => {
          try {
            return factory(...plan.args.map(arg => this.visit(arg, descendantRealizer)));
          } catch (error) {
            madeThrew = true;
            madeError = error;
            throw error;
          }
        },
      });
    } catch (error) {
      if (madeThrew && error === madeError) {
        throw error;
      }
      throw new LifetimeModelError(plan.populatedAddress, error);
    }
  }

  protected visitCtor(plan: CtorPlan, realizer: Realizer): any {
    return new plan.ctor(...plan.args.map(arg => this.visit(arg, realizer)));
  }

  protected visitFactory(plan: FactoryPlan, realizer: Realizer): any {
    return plan.factory(...plan.args.map(arg => this.visit(arg, realizer)));
  }

  protected visitLateBound(plan: LateBoundPlan): any {
    return (...args: any[]) => this.#engine.resolveLatebound(plan.funcType, args, this.#serviceProvider);
  }

  protected visitLateBoundArg(plan: LateBoundArgPlan): any {
    return this.#args![plan.index];
  }

  /**
   * The closure `resolve(callableType, callable)` hands back: each call synthesizes a throwaway
   * registration for the caller's own `callable`, under `callableType` itself as the address, and
   * hands it to the engine as an invocation frame — nothing here is registered or cached.
   */
  protected visitInvoker(plan: InvokerPlan): any {
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
      return this.#engine.resolveFrame(registration, this.#serviceProvider);
    };
  }

  protected visitConstant(plan: ConstantPlan): any {
    return plan.value;
  }

  protected visitServiceProvider(_plan: ServiceProviderPlan): any {
    return this.#serviceProvider;
  }

  /**
   * @remarks
   * Re-iterable rather than a one-shot iterator: a caller that walks it twice gets a value both
   * times. Each walk realizes afresh, so a transient member is a new instance per pass.
   */
  protected visitIterable(plan: IterablePlan, realizer: Realizer): any {
    return { [Symbol.iterator]: () => Iterator.from(plan.types).map(inner => this.visit(inner, realizer)) };
  }

  protected visitArray(plan: ArrayPlan, realizer: Realizer): any {
    return plan.types.map(inner => this.visit(inner, realizer));
  }
}

/** Realizes {@link plan} into its value; the walk is synchronous throughout. */
export function realizePlan(plan: Plan, options: RealizeOptions): any {
  return new RealizeVisitor(options).visit(plan, options.realizer);
}
