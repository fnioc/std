import { type HookChain, type IServiceProvider, Registration } from '@rhombus-std/di.core';
import type { Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Ctor, Func } from '@rhombus-toolkit/func';
import { iterable } from '@rhombus-toolkit/obj';
import { assertNever } from '@rhombus-toolkit/type-guards';
import { ServiceProvider } from '../../ServiceProvider.js';
import type { Engine } from '../Engine.js';
import { gather } from './gather.js';
import type { ArrayPlan, AsyncIterablePlan, AsyncPlan, ConstantPlan, CtorPlan, FactoryPlan, InvokerPlan, IterablePlan, LateBoundArgPlan, LateBoundPlan, Plan, PromisePlan, RegisteredCtorPlan,
  RegisteredFactoryPlan, RegisteredPromisePlan, ServiceProviderPlan } from './Plan.js';

/**
 * What one position in a walk carries. Immutable: a position that changes any of it derives a fresh
 * context for the subtree beneath, leaving every other position's own untouched.
 */
export interface VisitorContext {
  /**
   * One state per installed behavior, each at the slot its owner threads — frozen, and opaque to
   * everything here: a slot is moved between the chain and its owner and never read.
   */
  readonly states: readonly unknown[];
  /** A latebound call's arguments, read by position from the {@link LateBoundArgPlan}s in its plan. */
  readonly args?: readonly unknown[];
  /** What the enclosing boundary settled, read back by node identity; absent outside one. */
  readonly hoisted?: ReadonlyMap<AsyncPlan, unknown>;
}

export interface RealizeOptions {
  readonly engine: Engine;
  /** The one chain this resolution runs through, as its behaviors aggregated where it opened. */
  readonly chain: HookChain;
  /** What the walk starts carrying. */
  readonly context: VisitorContext;
}

/**
 * What a callable minted mid-walk carries into its own call: every behavior's state at the position
 * it was minted, and nothing an enclosing boundary settled — the call opens its own boundaries, and
 * a map of what some earlier one settled would answer its plan nodes with stale values.
 */
function captureForLaterCall(context: VisitorContext): VisitorContext {
  return { states: context.states };
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
  readonly #chain: HookChain;

  constructor({ engine, chain }: RealizeOptions) {
    this.#engine = engine;
    this.#chain = chain;
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
        return this.visitLateBound(plan, context);
      case 'latebound-arg':
        return this.visitLateBoundArg(plan, context);
      case 'invoker':
        return this.visitInvoker(plan, context);
      case 'constant':
        return this.visitConstant(plan);
      case 'service-provider':
        return this.visitServiceProvider(plan, context);
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
    return this.#realize(plan, plan.populatedAddress, plan.registration, context, within => new plan.ctor(...plan.args.map(arg => this.visit(arg, within))));
  }

  protected visitRegisteredFactory(plan: RegisteredFactoryPlan, context: VisitorContext): any {
    return this.#realize(plan, plan.populatedAddress, plan.registration, context, within => plan.factory(...plan.args.map(arg => this.visit(arg, within))));
  }

  /**
   * Constructs through the engine's one chain: a `{result}` answer is the node's value, built by
   * nobody and swept by nothing, while anything else means going ahead under the states every
   * behavior just filed — one derived context, whatever the chain's length. What is built is
   * canonicalized, and the node settles on whatever that answered before anything downstream reads
   * it.
   */
  #realize(plan: Plan, populatedAddress: Type, registration: Registration<unknown> | undefined, context: VisitorContext, make: Func<[VisitorContext], unknown>): any {
    const construction: HookChain.Construction = { node: plan, populatedAddress, registration, states: context.states };
    const withinStates = context.states.slice();
    const answer = this.#chain.beforeConstruct(construction, withinStates);
    if (answer) {
      return answer.result;
    }
    const instance = this.#chain.canonicalize(construction, make({ ...context, states: Object.freeze(withinStates) }));
    this.#chain.afterConstruct(construction, instance);
    return instance;
  }

  protected visitCtor(plan: CtorPlan, context: VisitorContext): any {
    return new plan.ctor(...plan.args.map(arg => this.visit(arg, context)));
  }

  protected visitFactory(plan: FactoryPlan, context: VisitorContext): any {
    return plan.factory(...plan.args.map(arg => this.visit(arg, context)));
  }

  /**
   * Each call re-enters under the states at the position the function was minted — the model's
   * `{state}` re-threading makes that position's state the honest ownership state: a
   * singleton's factory carries the root-threaded state, a scoped service's factory carries its
   * own owning state.
   */
  protected visitLateBound(plan: LateBoundPlan, context: VisitorContext): any {
    return (...args: any[]) => this.#engine.resolveLatebound(plan.funcType, args, { chain: this.#chain, context: captureForLaterCall(context) });
  }

  protected visitLateBoundArg(plan: LateBoundArgPlan, context: VisitorContext): any {
    return context.args![plan.index];
  }

  /**
   * The closure `resolve(callableType, callable)` hands back: each call synthesizes a throwaway
   * registration for the caller's own `callable`, under `callableType` itself as the address, and
   * hands it to the engine as an invocation frame — nothing here is registered or cached.
   */
  protected visitInvoker(plan: InvokerPlan, context: VisitorContext): any {
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
      return this.#engine.resolveFrame(registration, { chain: this.#chain, context: captureForLaterCall(context) });
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
  protected visitServiceProvider(plan: ServiceProviderPlan, context: VisitorContext): any {
    return this.#realize(plan, typefor<IServiceProvider>(), undefined, context, () => new ServiceProvider(this.#engine));
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

  /**
   * A registration answered the promise address itself, so the wrapping promise is its product:
   * the construction protocol runs here with the envelope as the make, and a later ask for the
   * same address answers the kept promise and enters nothing beneath it.
   */
  protected visitRegisteredPromise(plan: RegisteredPromisePlan, context: VisitorContext): any {
    return this.#realize(plan, plan.envelope.populatedAddress, plan.registration, context, within => this.#deliver(plan.envelope, within));
  }

  async #deliver(plan: PromisePlan, context: VisitorContext): Promise<unknown> {
    if (!plan.inventory.length) {
      return this.visit(plan.inner, context);
    }
    const hoisted = await gather(plan.inventory, plan.populatedAddress, entry => {
      // The inner visit's own beforeConstruct is the hit-skip: a cached promise prunes the entire
      // inner boundary, and a settled cached promise costs one microtask.
      return this.visit(entry.inner, context);
    });
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
