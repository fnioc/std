import { Registration, type Request } from '@rhombus-std/di.core';
import type { Ctor, Func } from '@rhombus-toolkit/func';
import { iterable } from '@rhombus-toolkit/obj';
import { assertNever } from '@rhombus-toolkit/type-guards';
import type { Engine } from '../Engine.js';
import { gather } from './gather.js';
import type { ArrayPlan, AsyncIterablePlan, AsyncPlan, ConstantPlan, CtorPlan, FactoryPlan, InvokerPlan, IterablePlan, LateBoundArgPlan, LateBoundPlan, Plan, PromisePlan, RegisteredCtorPlan,
  RegisteredFactoryPlan, RegisteredPromisePlan } from './Plan.js';

/**
 * What one position in a walk carries. Immutable: a position that changes any of it derives a fresh
 * context for the subtree beneath, leaving every other position's own untouched.
 */
export interface VisitorContext {
  /** A latebound call's arguments, read by position from the {@link LateBoundArgPlan}s in its plan. */
  readonly args?: readonly unknown[];
  /** What the enclosing boundary settled, read back by node identity; absent outside one. */
  readonly hoisted?: ReadonlyMap<AsyncPlan, unknown>;
}

export interface RealizeOptions {
  readonly engine: Engine;
  /** What the walk starts carrying. */
  readonly context: VisitorContext;
  /** The request that opened this resolution — captured for the whole lifecycle including latebounds. */
  readonly request: Request;
}

/**
 * Realizes a {@link Plan} tree into the value it describes.
 *
 * @remarks
 * One instance per walk, entered through {@link realizePlan}. One {@link VisitorContext} descends
 * with the walk, deriving wherever a construction changes what sits beneath it.
 */
export class RealizeVisitor {
  readonly #engine: Engine;
  readonly #request: Request;

  constructor({ engine, request }: RealizeOptions) {
    this.#engine = engine;
    this.#request = request;
  }

  visit(plan: Plan, context: VisitorContext): any {
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
        return this.visitLateBound(plan);
      case 'latebound-arg':
        return this.visitLateBoundArg(plan, context);
      case 'invoker':
        return this.visitInvoker(plan);
      case 'constant':
        return this.visitConstant(plan);
      case 'iterable':
        return this.visitIterable(plan, context);
      case 'array':
        return this.visitArray(plan, context);
      case 'promise':
        return this.visitPromise(plan, context);
      case 'registered-promise':
        return this.visitRegisteredPromise(plan, context);
      case 'async':
        return this.visitAsync(plan, context);
      case 'async-iterable':
        return this.visitAsyncIterable(plan, context);
      default:
        return assertNever(plan);
    }
  }

  protected visitRegisteredCtor(plan: RegisteredCtorPlan, context: VisitorContext): any {
    return new plan.ctor(...this.#callArgs(plan, context));
  }

  protected visitRegisteredFactory(plan: RegisteredFactoryPlan, context: VisitorContext): any {
    return plan.factory(...this.#callArgs(plan, context));
  }

  /** The call's realized argument list: one value per arg plan, then the rest plan's list spread one argument per element. */
  #callArgs(plan: { readonly args: Plan[]; readonly rest?: Plan; }, context: VisitorContext): any[] {
    const values = plan.args.map(arg => this.visit(arg, context));
    if (plan.rest !== undefined) {
      values.push(...this.visit(plan.rest, context));
    }
    return values;
  }

  protected visitCtor(plan: CtorPlan, context: VisitorContext): any {
    return new plan.ctor(...this.#callArgs(plan, context));
  }

  protected visitFactory(plan: FactoryPlan, context: VisitorContext): any {
    return plan.factory(...this.#callArgs(plan, context));
  }

  /**
   * Each call re-enters under the request the function was minted under rather than meeting a
   * new one, and opens boundaries of its own — nothing an enclosing boundary settled carries in,
   * since a map of what some earlier one settled would answer the call's plan nodes with stale
   * values.
   */
  protected visitLateBound(plan: LateBoundPlan): any {
    const request = this.#request;
    return (...args: any[]) => this.#engine.resolveLatebound(plan.funcType, args, request);
  }

  protected visitLateBoundArg(plan: LateBoundArgPlan, context: VisitorContext): any {
    return context.args![plan.index];
  }

  /**
   * The closure `resolve(callableType, callable)` hands back: each call synthesizes a throwaway
   * registration for the caller's own `callable`, under `callableType` itself as the address, and
   * hands it to the engine as an invocation frame — nothing here is registered or cached.
   */
  protected visitInvoker(plan: InvokerPlan): any {
    const { callableType } = plan;
    const request = this.#request;
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
      return this.#engine.resolveFrame(registration, request);
    };
  }

  protected visitConstant(plan: ConstantPlan): any {
    return plan.value;
  }

  /**
   * A live query: each iteration step realizes one element, consulting the scope model at that
   * moment — later steps see later scope state, transients are fresh per iteration, and
   * short-circuit skips construction. Re-iteration mints a fresh walk.
   */
  protected visitIterable(plan: IterablePlan, context: VisitorContext): any {
    return iterable(() => Iterator.from(plan.types).map(inner => this.visit(inner, context)));
  }

  /** A snapshot: every element is realized eagerly at resolution time. */
  protected visitArray(plan: ArrayPlan, context: VisitorContext): any {
    return plan.types.map(inner => this.visit(inner, context));
  }

  /** The wrapping promise this boundary hands over — pure plan structure, minted afresh per ask. */
  protected visitPromise(plan: PromisePlan, context: VisitorContext): any {
    return this.#deliver(plan, context);
  }

  /** A registration answered the promise address itself, so the wrapping promise is its product, delivered from the envelope. */
  protected visitRegisteredPromise(plan: RegisteredPromisePlan, context: VisitorContext): any {
    return this.#deliver(plan.envelope, context);
  }

  async #deliver(plan: PromisePlan, context: VisitorContext): Promise<unknown> {
    if (!plan.inventory.length) {
      return this.visit(plan.inner, context);
    }
    const hoisted = await gather(plan.inventory, plan.populatedAddress, entry => this.visit(entry.inner, context));
    return this.visit(plan.inner, { ...context, hoisted });
  }

  /** The boundary above settled this dependency already, so the walk beneath reads it and never waits. */
  protected visitAsync(plan: AsyncPlan, context: VisitorContext): any {
    return context.hoisted!.get(plan);
  }

  /**
   * @remarks
   * Re-iterable rather than a one-shot iterator, exactly as its synchronous sibling is: each walk
   * settles its elements afresh.
   */
  protected visitAsyncIterable(plan: AsyncIterablePlan, context: VisitorContext): any {
    return { [Symbol.asyncIterator]: () => this.#drain(plan, context) };
  }

  /**
   * One step per element: the element's own boundary waits when its step runs, so an element
   * nobody iterates is never realized and nothing runs ahead of the step needing it.
   */
  async *#drain(plan: AsyncIterablePlan, context: VisitorContext): AsyncGenerator<unknown> {
    for (const element of plan.elements) {
      yield await this.visit(element, context);
    }
  }
}
