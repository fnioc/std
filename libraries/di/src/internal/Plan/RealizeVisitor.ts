import { ControlRequest, type Handle, type Hooks, Registration, Request, ServiceRequest, UnsatisfiableError } from '@rhombus-std/di.core';
import type { Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Ctor, Func } from '@rhombus-toolkit/func';
import { iterable } from '@rhombus-toolkit/obj';
import { assertNever } from '@rhombus-toolkit/type-guards';
import type { Engine } from '../Engine.js';
import { gather } from './gather.js';
import type { AlwaysDispatch, AlwaysHook, Entry, InstalledHooks } from './InstalledHooks.js';
import type { ArrayPlan, AsyncIterablePlan, AsyncPlan, ConstantPlan, CtorPlan, FactoryPlan, InvokerPlan, IterablePlan, LateBoundArgPlan, LateBoundPlan, Plan, PromisePlan, RegisteredCtorPlan,
  RegisteredFactoryPlan, RegisteredPromisePlan, RequestPlan } from './Plan.js';

/**
 * What one position in a walk carries. Immutable: a position that changes any of it derives a fresh
 * context for the subtree beneath, leaving every other position's own untouched.
 */
export interface VisitorContext {
  /** A latebound call's arguments, read by position from the {@link LateBoundArgPlan}s in its plan. */
  readonly args?: readonly unknown[];
  /** What the enclosing boundary settled, read back by node identity; absent outside one. */
  readonly hoisted?: ReadonlyMap<AsyncPlan, unknown>;
  /** Each participating behavior's threaded state, one slot per behavior; absent while no hook participates in the ask. */
  readonly states?: readonly unknown[];
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
 * One instance per walk, entered through {@link realize} — the door that opens the ask's hook
 * dispatch. One {@link VisitorContext} descends with the walk, deriving wherever a construction
 * changes what sits beneath it.
 */
export class RealizeVisitor {
  readonly #engine: Engine;
  readonly #request: Request;
  readonly #installed: InstalledHooks;
  /** The always-active dispatch as this walk opened — an install during the ask never reaches it. */
  readonly #always: AlwaysDispatch;
  /** The staged handles the ask activated, in activation order. */
  readonly #active: readonly Handle[];

  constructor({ engine, request }: RealizeOptions) {
    this.#engine = engine;
    this.#request = request;
    this.#installed = engine.installedHooks;
    this.#always = this.#installed.always;
    this.#active = request['active'];
  }

  /**
   * The door one resolution enters through: sizes the ask's state slots and runs `beginResolve`
   * once — or, when nothing is installed and nothing is activated, walks the plan with no
   * apparatus at all. A seeded root opens no dispatch: the engine's own rows are invisible to
   * hooks.
   */
  realize(plan: Plan, context: VisitorContext): any {
    if (this.#isSeededRoot(plan)) {
      return this.visit(plan, context);
    }
    const always = this.#always;
    const active = this.#active;
    if (always.count === 0 && active.length === 0) {
      return this.visit(plan, context);
    }
    const states: unknown[] = new Array(always.count + active.length).fill(undefined);
    this.#beginResolveFrom(0, this.#request, undefined, states);
    if (!this.#hasConstructionHooks()) {
      // Nothing that could fire at a node is installed or activated, so the walk skips the
      // construction protocol entirely — no hook can observe the difference.
      return this.visit(plan, context);
    }
    return this.visit(plan, { ...context, states });
  }

  /** Whether any construction-kind hook — before, canonicalize, after — can fire for this ask. */
  #hasConstructionHooks(): boolean {
    const always = this.#always;
    if (always.beforeConstruct.length || always.canonicalize.length || always.afterConstruct.length) {
      return true;
    }
    for (const handle of this.#active) {
      const entry = this.#installed.entryAt(handle.index);
      if (entry !== undefined && entry.staged
        && (entry.beforeConstruct !== undefined || entry.canonicalize !== undefined || entry.afterConstruct !== undefined)) {
        return true;
      }
    }
    return false;
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
      case 'request':
        return this.visitRequest(plan);
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
    if (context.states === undefined || this.#engine.isSeeded(plan.registration)) {
      return new plan.ctor(...this.#callArgs(plan, context));
    }
    return this.#constructed(plan, plan.populatedAddress, plan.registration, context, inner => new plan.ctor(...this.#callArgs(plan, inner)));
  }

  protected visitRegisteredFactory(plan: RegisteredFactoryPlan, context: VisitorContext): any {
    if (context.states === undefined || this.#engine.isSeeded(plan.registration)) {
      return plan.factory(...this.#callArgs(plan, context));
    }
    return this.#constructed(plan, plan.populatedAddress, plan.registration, context, inner => plan.factory(...this.#callArgs(plan, inner)));
  }

  /** The call's realized argument list: one value per arg plan, then the rest plan's list spread one argument per element. */
  #callArgs(plan: { readonly args: Plan[]; readonly rest?: Plan; }, context: VisitorContext): any[] {
    const values = new Array<any>(plan.args.length);
    for (let i = 0; i < plan.args.length; i++) {
      values[i] = this.visit(plan.args[i]!, context);
    }
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
   * The ask in flight, answered when it is an instance of the class the slot names — the base
   * `Request` answers either arm.
   *
   * @throws {UnsatisfiableError} when the ask is the other arm.
   */
  protected visitRequest(plan: RequestPlan): any {
    const request = this.#request;
    const asked = plan.address === typefor<ServiceRequest>()
      ? ServiceRequest
      : plan.address === typefor<ControlRequest>()
      ? ControlRequest
      : Request;
    if (request instanceof asked) {
      return request;
    }
    throw new UnsatisfiableError(plan.address, 'the ask in flight is not an instance of the asked request class');
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
   * A registration answered the promise address itself, so the wrapping promise is its product,
   * delivered from the envelope — and the construction the hooks see at this node.
   */
  protected visitRegisteredPromise(plan: RegisteredPromisePlan, context: VisitorContext): any {
    if (context.states === undefined || this.#engine.isSeeded(plan.registration)) {
      return this.#deliver(plan.envelope, context);
    }
    return this.#constructed(plan, plan.envelope.populatedAddress, plan.registration, context, inner => this.#deliver(plan.envelope, inner));
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

  // #region hook dispatch

  /** Whether the plan's root is one of the engine's own seeded rows — such an ask opens no dispatch. */
  #isSeededRoot(plan: Plan): boolean {
    return (plan.kind === 'registered-ctor' || plan.kind === 'registered-factory' || plan.kind === 'registered-promise')
      && this.#engine.isSeeded(plan.registration);
  }

  /**
   * The construction protocol at a registration-carrying node: `beforeConstruct` outermost-first
   * (a `{ result }` stands for the construction — nothing later runs, nothing is built), the make
   * under any redirected states, then `canonicalize` and `afterConstruct` innermost-first so the
   * outermost proxy ends outermost.
   */
  #constructed(
    node: object,
    populatedAddress: Type,
    registration: Registration<unknown>,
    context: VisitorContext,
    make: (context: VisitorContext) => unknown,
  ): any {
    const states = context.states!;
    const outcome = this.#beforeConstructFrom(0, node, populatedAddress, registration, states);
    if (!isStates(outcome)) {
      return outcome.result;
    }
    const instance = make(outcome === states ? context : { ...context, states: outcome });
    const canonical = this.#canonicalizeFrom(0, node, populatedAddress, registration, states, instance);
    this.#afterConstructFrom(0, node, populatedAddress, registration, states, canonical);
    return canonical;
  }

  /**
   * The participant at or after combined position `k` for one hook kind, or -1: positions inside
   * `list` are the precomputed always-active hooks; the rest walk the ask's activated handles in
   * activation order, skipping emptied slots, non-staged entries (they already ran in the always
   * set) and behaviors without the kind.
   */
  #participantFrom(list: readonly AlwaysHook[], kind: keyof Hooks, k: number): number {
    if (k < list.length) {
      return k;
    }
    const active = this.#active;
    for (let j = k - list.length; j < active.length; j++) {
      const entry = this.#installed.entryAt(active[j]!.index);
      if (entry !== undefined && entry.staged && entry[kind] !== undefined) {
        return list.length + j;
      }
    }
    return -1;
  }

  #entryAt(list: readonly AlwaysHook[], position: number): Entry {
    return position < list.length ? list[position]!.entry : this.#installed.entryAt(this.#active[position - list.length]!.index)!;
  }

  #slotAt(list: readonly AlwaysHook[], position: number): number {
    return position < list.length ? list[position]!.slot : this.#always.count + (position - list.length);
  }

  /** Fills each participating behavior's state slot, outermost first; a middleware-form layer's `next` runs everything later. */
  #beginResolveFrom(k: number, request: Request, injected: unknown, states: unknown[]): void {
    const list = this.#always.beginResolve;
    const position = this.#participantFrom(list, 'beginResolve', k);
    if (position === -1) {
      return;
    }
    const entry = this.#entryAt(list, position);
    const slot = this.#slotAt(list, position);
    const fn = entry.behavior.beginResolve!;
    if (entry.beginResolve) {
      states[slot] = (fn as Func)(request, injected, (nextRequest: Request, nextInjected: unknown) => {
        this.#beginResolveFrom(position + 1, nextRequest, nextInjected, states);
        return nextInjected;
      });
      return;
    }
    states[slot] = (fn as Hooks['beginResolve'])(request, injected);
    this.#beginResolveFrom(position + 1, request, injected, states);
  }

  /**
   * Runs the `beforeConstruct` layers from combined position `k` on, outermost first. Answers
   * `{ result }` the moment a layer intercepts — later layers never run — or the states the
   * construction's subtree resolves under, rewritten copy-on-write wherever a layer redirected
   * its own slot.
   */
  #beforeConstructFrom(
    k: number,
    node: object,
    populatedAddress: Type,
    registration: Registration<unknown>,
    states: readonly unknown[],
  ): { readonly result: unknown; } | readonly unknown[] {
    const list = this.#always.beforeConstruct;
    const position = this.#participantFrom(list, 'beforeConstruct', k);
    if (position === -1) {
      return states;
    }
    const entry = this.#entryAt(list, position);
    const slot = this.#slotAt(list, position);
    const fn = entry.behavior.beforeConstruct!;
    const construction: Hooks.Construction = { node, populatedAddress, registration, state: states[slot] };
    if (entry.beforeConstruct) {
      let beneath: { readonly result: unknown; } | readonly unknown[] | undefined;
      const answer: Hooks.Interception = (fn as Func)(construction, (inner: Hooks.Construction) => {
        const outcome = this.#beforeConstructFrom(position + 1, node, populatedAddress, registration, withSlot(states, slot, inner.state));
        beneath = outcome;
        return isStates(outcome) ? { state: inner.state } : outcome;
      });
      if ('result' in answer) {
        return answer;
      }
      const base = beneath !== undefined && isStates(beneath) ? beneath : states;
      return withSlot(base, slot, answer.state);
    }
    const answer = (fn as Hooks['beforeConstruct'])(construction);
    if ('result' in answer) {
      return answer;
    }
    return this.#beforeConstructFrom(position + 1, node, populatedAddress, registration, withSlot(states, slot, answer.state));
  }

  /** Folds the instance through the `canonicalize` layers, innermost first, so the outermost proxy ends outermost. */
  #canonicalizeFrom(
    k: number,
    node: object,
    populatedAddress: Type,
    registration: Registration<unknown>,
    states: readonly unknown[],
    instance: unknown,
  ): unknown {
    const list = this.#always.canonicalize;
    const position = this.#participantFrom(list, 'canonicalize', k);
    if (position === -1) {
      return instance;
    }
    const entry = this.#entryAt(list, position);
    const slot = this.#slotAt(list, position);
    const fn = entry.behavior.canonicalize!;
    const construction: Hooks.Construction = { node, populatedAddress, registration, state: states[slot] };
    if (entry.canonicalize) {
      return (fn as Func)(
        construction,
        instance,
        (_inner: Hooks.Construction, innerInstance: unknown) => this.#canonicalizeFrom(position + 1, node, populatedAddress, registration, states, innerInstance),
      );
    }
    return (fn as Hooks['canonicalize'])(construction, this.#canonicalizeFrom(position + 1, node, populatedAddress, registration, states, instance));
  }

  /** Runs the `afterConstruct` layers, innermost first, on the instance as it stands. */
  #afterConstructFrom(
    k: number,
    node: object,
    populatedAddress: Type,
    registration: Registration<unknown>,
    states: readonly unknown[],
    instance: unknown,
  ): void {
    const list = this.#always.afterConstruct;
    const position = this.#participantFrom(list, 'afterConstruct', k);
    if (position === -1) {
      return;
    }
    const entry = this.#entryAt(list, position);
    const slot = this.#slotAt(list, position);
    const fn = entry.behavior.afterConstruct!;
    const construction: Hooks.Construction = { node, populatedAddress, registration, state: states[slot] };
    if (entry.afterConstruct) {
      (fn as Func)(construction, instance, (_inner: Hooks.Construction, innerInstance: unknown) => {
        this.#afterConstructFrom(position + 1, node, populatedAddress, registration, states, innerInstance);
      });
      return;
    }
    this.#afterConstructFrom(position + 1, node, populatedAddress, registration, states, instance);
    (fn as Hooks['afterConstruct'])(construction, instance);
  }

  // #endregion
}

/** Tells the redirected-states outcome apart from a `{ result }` interception. */
function isStates(outcome: { readonly result: unknown; } | readonly unknown[]): outcome is readonly unknown[] {
  return Array.isArray(outcome);
}

/** `states` with `value` in `slot`, copied only when that changes anything. */
function withSlot(states: readonly unknown[], slot: number, value: unknown): readonly unknown[] {
  if (states[slot] === value) {
    return states;
  }
  const next = states.slice();
  next[slot] = value;
  return next;
}
