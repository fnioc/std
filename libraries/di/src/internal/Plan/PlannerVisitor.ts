import { type ControlRequest, CycleError, type Hooks, type Invoker, type Registration, type Request, type ServiceRequest, UnsatisfiableError } from '@rhombus-std/di.core';
import { type AbstractConstructorType, type ArrayType, type ConstructorType, type FunctionType, type GenericType, type GlobalType, type ImportedType, type IntersectionType, type IterableType,
  type ObjectType, type TagType, type TupleType, Type, type TypeLiteralType, type UnionType } from '@rhombus-std/primitives';
import { type Generic, typefor } from '@rhombus-std/primitives.extras';
import type { Ctor, Func } from '@rhombus-toolkit/func';
import { isDefined } from '@rhombus-toolkit/type-guards';
import type { Registry } from '../Registry.js';
import { type AlwaysDispatch, type Entry, type PlanHooks, withSlot } from './InstalledHooks.js';
import { type AsyncPlan, Plan } from './Plan.js';

/**
 * What a planning walk threads through {@link PlannerVisitor.visit}: the collection point of the
 * nearest enclosing await, onto which an awaited dependency hoists itself. Absent while nothing
 * encloses the walk in a promise.
 */
export interface PlanningContext {
  asyncDescendants?: AsyncPlan[];
}

/**
 * Turns a type expression into the {@link Plan} that constructs a value for it.
 *
 * @remarks
 * Exact match lookup first, falling back to Type specific synthesis behavior.
 */
export class PlannerVisitor extends Type.Visitor<Plan | undefined, PlanningContext> {
  readonly #registry: Registry;
  /** A latebound caller's argument types, each naming the call position that supplies it. */
  readonly #args: ReadonlyMap<Type, number> | undefined;
  readonly #cycleGuard = new CycleGuard();
  /** The whole pass's failure notes. */
  readonly #diagnostics: PassDiagnostics = { missingDependency: undefined };
  /** What this pass fires plan hooks through; absent when nothing asked for them. */
  readonly #hooks: PlanHooks | undefined;
  /** The always-active dispatch as this pass opened. */
  readonly #always: AlwaysDispatch | undefined;
  /** Each participating behavior's threaded state at the walk's current position. */
  #planStates: readonly unknown[] | undefined;

  constructor(registry: Registry, args?: ReadonlyMap<Type, number>, hooks?: PlanHooks) {
    super();
    this.#registry = registry;
    this.#args = args;
    this.#hooks = hooks;
    this.#always = hooks?.installed.always;
    this.#planStates = hooks === undefined ? undefined : new Array(this.#always!.count + hooks.active.length).fill(undefined);
  }

  /** The specific type the whole pass could not build from, once {@link visit} has returned `undefined`. */
  get missingDependency(): Type | undefined {
    return this.#diagnostics.missingDependency;
  }

  public override visit(address: Type, context: PlanningContext = {}): Plan | undefined {
    if (Type.isOpen(address)) {
      return undefined;
    }
    // A caller's argument outranks every registration, statically: the slot is served by the
    // call itself, so the manifest is never consulted for it.
    const argIndex = this.#args?.get(address);
    if (argIndex !== undefined) {
      return Plan.lateboundArg(argIndex);
    }
    using _guard = this.#cycleGuard.visiting(address);
    const plan = this.#answer(address, context) ?? this.#awaitMissing(address, context);
    if (plan === undefined && this.#diagnostics.missingDependency === undefined) {
      this.#diagnostics.missingDependency = address;
    }
    return plan;
  }

  /**
   * The answer for `address`: the newest registration answering it, then the kind's own synthesis.
   * A promise-headed request is a boundary, so it goes straight to synthesis — {@link visitGlobal}
   * routes it to {@link #visitPromise}, which mints the boundary around its own match and unwrap.
   */
  #answer(address: Type, context: PlanningContext): Plan | undefined {
    if (Type.isPromiseLike(address)) {
      return this.#synthesize(address, context);
    }
    return this.#matched(address, context) ?? this.#synthesize(address, context);
  }

  /** The newest registration answering `address`, lowered under `context`; absent when none does. */
  #matched(address: Type, context: PlanningContext): Plan | undefined {
    return this.#registry.getMatches(address)
      .map(match => Plan.fromMatch(address, match, this, context))
      .find(Boolean);
  }

  /** The kind's own synthesis for `address` — the base dispatch. */
  #synthesize(address: Type, context: PlanningContext): Plan | undefined {
    return super.visit(address, context);
  }

  /**
   * The awaited answer for a missed `address`: when `Promise<address>` is registered, the settled
   * value is served by awaiting that promise, hoisted onto the enclosing boundary. With no boundary
   * to hoist onto, the await has nothing to wait in.
   *
   * @throws {UnsatisfiableError} when only the promised form is registered and nothing encloses an
   * await to hoist it.
   */
  #awaitMissing(address: Type, context: PlanningContext): AsyncPlan | undefined {
    if (Type.isPromiseLike(address)) {
      // Nothing distinguishes a promise of a promise, so a promise-headed miss is a plain miss.
      return undefined;
    }
    const promised = Type.promise(address);
    if (!this.#registry.hasMatch(promised) || this.#cycleGuard.isVisiting(promised)) {
      return undefined;
    }
    if (context.asyncDescendants === undefined) {
      throw new UnsatisfiableError(address, `only ${promised} is registered, and nothing encloses an await to hoist it`);
    }
    return this.#visitAsync(address, context);
  }

  /**
   * The promise boundary for `type`: whatever answers it — a registration for the promise itself, or
   * the settled value awaited — wrapped so the awaits beneath it collect and settle together.
   */
  #visitPromise(type: GlobalType, context: PlanningContext): Plan | undefined {
    const built = this.#collect(context, () => this.#matched(type, context) ?? this.visit(Type.awaited(type), context));
    return built && this.#promiseNode(built.inner, built.descendants, type);
  }

  /**
   * The async node for a settled `address`: `Promise<address>` is registered, so the value is served
   * by awaiting it. The node collects its own awaited descendants, then hands itself to the enclosing
   * boundary to be hoisted.
   */
  #visitAsync(address: Type, context: PlanningContext): AsyncPlan | undefined {
    const promised = Type.promise(address);
    using _guard = this.#cycleGuard.visiting(promised);
    const built = this.#collect(context, () => this.#matched(promised, context));
    if (built === undefined) {
      return undefined;
    }
    const hoisted = Plan.async(built.inner, built.descendants, address);
    context.asyncDescendants!.push(hoisted);
    return hoisted;
  }

  /**
   * Opens a fresh collection point for the awaits beneath a promise boundary, runs `walk` under it,
   * and answers what `walk` built alongside the descendants it collected; absent when `walk` finds
   * nothing.
   */
  #collect(context: PlanningContext, walk: () => Plan | undefined): { inner: Plan; descendants: AsyncPlan[]; } | undefined {
    const descendants: AsyncPlan[] = [];
    const enclosing = context.asyncDescendants;
    context.asyncDescendants = descendants;
    try {
      const inner = walk();
      return inner === undefined ? undefined : { inner, descendants };
    } finally {
      context.asyncDescendants = enclosing;
    }
  }

  /**
   * Wraps a boundary's answer as its promise node — a registered promise when the registration owns
   * the promise address itself, a plain one otherwise.
   */
  #promiseNode(inner: Plan, descendants: readonly AsyncPlan[], promiseAddress: Type): Plan {
    return (inner.kind === 'registered-ctor' || inner.kind === 'registered-factory') && inner.populatedAddress === promiseAddress
      ? Plan.registeredPromise(inner, descendants, promiseAddress)
      : Plan.promise(inner, descendants, promiseAddress);
  }

  /**
   * The answer for `address` among only the registrations after `position` — how a slot naming
   * its own registration's address resolves what that registration shadows. No guard frame opens
   * for the address itself (the walk that reached the slot already holds it); the strictly
   * growing position bounds the nesting, and a dependency elsewhere in the graph that loops back
   * still trips the guard.
   *
   * @remarks
   * No synthesis stands beneath the matches: a self-named slot with nothing older to answer it is
   * unsatisfiable.
   */
  visitBeneath(address: Type, position: number, context: PlanningContext): Plan | undefined {
    const plan = this.#registry.getMatches(address, undefined, position + 1)
      .map(match => Plan.fromMatch(address, match, this, context))
      .find(isDefined);
    if (plan === undefined && this.#diagnostics.missingDependency === undefined) {
      this.#diagnostics.missingDependency = address;
    }
    return plan;
  }

  /**
   * Fires the plan hooks for a registered node being made, before its slots lower: each layer
   * reads its own state off the walk and answers the state the node's dependencies are planned
   * under. Answers what {@link closePlanned} restores once the slots have lowered — `undefined`
   * when nothing fires, including at the engine's own seeded rows.
   */
  openPlanned(node: object, populatedAddress: Type, registration: Registration<unknown>): readonly unknown[] | undefined {
    const hooks = this.#hooks;
    if (hooks === undefined || hooks.installed.seeded(registration)) {
      return undefined;
    }
    const previous = this.#planStates!;
    this.#planStates = this.#beforePlanFrom(0, node, populatedAddress, registration, previous);
    return previous;
  }

  /** Restores what {@link openPlanned} answered, once the node's slots have lowered. */
  closePlanned(previous: readonly unknown[] | undefined): void {
    if (previous !== undefined) {
      this.#planStates = previous;
    }
  }

  /** Runs the plan-hook layers from combined position `k` on, outermost first, answering the states the node's slots lower under. */
  #beforePlanFrom(k: number, node: object, populatedAddress: Type, registration: Registration<unknown>, states: readonly unknown[]): readonly unknown[] {
    const always = this.#always!;
    const list = always.beforePlan;
    const active = this.#hooks!.active;
    let slot = -1;
    let entry: Entry | undefined;
    while (true) {
      if (k < list.length) {
        ({ slot, entry } = list[k]!);
        break;
      }
      const j = k - list.length;
      if (j >= active.length) {
        return states;
      }
      const candidate = this.#hooks!.installed.entryAt(active[j]!.index);
      if (candidate !== undefined && candidate.staged && candidate.beforePlan !== undefined) {
        slot = always.count + j;
        entry = candidate;
        break;
      }
      k++;
    }
    const construction: Hooks.Construction = { node, populatedAddress, registration, state: states[slot] };
    const fn = entry.behavior.beforePlan!;
    if (entry.beforePlan) {
      let beneath: readonly unknown[] | undefined;
      const answer = (fn as Func)(construction, (inner: Hooks.Construction) => {
        beneath = this.#beforePlanFrom(k + 1, node, populatedAddress, registration, withSlot(states, slot, inner.state));
        return inner.state;
      });
      return withSlot(beneath ?? states, slot, answer);
    }
    const answer = (fn as Hooks['beforePlan'])(construction);
    return this.#beforePlanFrom(k + 1, node, populatedAddress, registration, withSlot(states, slot, answer));
  }

  protected override visitImported(type: ImportedType): Plan | undefined {
    // A slot naming a request class is answered with the ask in flight, at realize time.
    if (type === typefor<Request>() || type === typefor<ServiceRequest>() || type === typefor<ControlRequest>()) {
      return Plan.request(type);
    }
    const callableType = invokerCallableType(type);
    return callableType && Plan.invoker(callableType);
  }

  /**
   * Two global names describe delivery rather than a value to build: a promise settles to whatever
   * answers what it carries, and a stepwise sequence carries one promise per element. Every other
   * global name describes none of itself to build from.
   */
  protected override visitGlobal(type: GlobalType, context: PlanningContext): Plan | undefined {
    if (Type.isPromiseLike(type)) {
      return this.#visitPromise(type, context);
    }
    const [matched, generics] = Type.bindGenerics(typefor<AsyncIterable<Generic<'E'>>>(), type);
    if (matched) {
      return Plan.asyncIterable(this.#planElements(Type.promise(generics.E!), context));
    }
    return undefined;
  }

  protected override visitGeneric(_type: GenericType): Plan | undefined {
    return undefined;
  }

  /** Parked: composing one from its arg types on a miss awaits its design ruling. */
  protected override visitCtor(_type: ConstructorType): Plan | undefined {
    return undefined;
  }

  protected override visitAbstractCtor(_type: AbstractConstructorType): Plan | undefined {
    return undefined;
  }

  protected override visitFunc(type: FunctionType): Plan | undefined {
    return Plan.latebound(type);
  }

  protected override visitArray(type: ArrayType, context: PlanningContext): Plan | undefined {
    return Plan.array(this.#planElements(type.element, context));
  }

  protected override visitIterable(type: IterableType, context: PlanningContext): Plan | undefined {
    return Plan.iterable(this.#planElements(type.element, context));
  }

  protected override visitIntersection(_type: IntersectionType): Plan | undefined {
    // An intersection is satisfiable only by ONE registration matching every member, and the
    // whole-type lookup in `visit` already performed that search: no synthesis can produce a
    // value that is all parts at once, so there is nothing left to decompose.
    return undefined;
  }

  protected override visitObject(type: ObjectType, context: PlanningContext): Plan | undefined {
    const names = Object.keys(type.members);
    const properties = names.map(name => this.visit(type.members[name]!, context));
    if (properties.some(p => !p)) {
      return undefined;
    }
    return Plan.factory((...values: any[]) => Object.fromEntries(names.map((name, position) => [name, values[position]])), properties as Plan[]);
  }

  protected override visitTag(_type: TagType): Plan | undefined {
    return undefined;
  }

  protected override visitTuple(type: TupleType, context: PlanningContext): Plan | undefined {
    const members = type.members.map(member => this.visit(member, context));
    if (members.some(p => !p)) {
      return undefined;
    }
    const rest = type.rest === undefined ? undefined : this.visit(Type.array(type.rest), context);
    return Plan.factory((...args: any[]) => args, members as Plan[], rest);
  }

  protected override visitTypeLiteral(type: TypeLiteralType): Plan | undefined {
    return Plan.constant(type.value);
  }

  /**
   * Reached only once the union's own address has no buildable answer: the first resolvable
   * member wins, in canonical order. With literals ordered last among members, a literal keeps
   * serving as the fallback of an optional dependency without being a special case.
   */
  protected override visitUnion(type: UnionType, context: PlanningContext): Plan | undefined {
    // Members are alternatives, so a member served only by an await with nothing to enclose it is
    // simply not available here — the union moves on to whatever else answers, a `undefined` literal
    // among them. An unmet await surfaces at the dependency that needed it, never at a union that
    // had another way to answer.
    for (const member of type.members) {
      try {
        const plan = this.visit(member, context);
        if (plan !== undefined) {
          return plan;
        }
      } catch (error) {
        if (!(error instanceof UnsatisfiableError)) {
          throw error;
        }
      }
    }
    return undefined;
  }

  /**
   * Every way the manifest produces {@link elementType}, in REGISTRATION order — services come
   * out in the order they were authored — with the element's one synthesis, if any, as the tail.
   *
   * @remarks
   * A promise-headed element admits registrations of the settled type too, each wrapped so the
   * element still arrives as a promise; one pass over the registrations keeps the two spellings in
   * a single authored order.
   */
  #planElements(elementType: Type, context: PlanningContext): Plan[] {
    const settled = Type.awaited(elementType);
    const producers = this.#registry.getMatches(elementType, Type.isPromiseLike(elementType) ? settled : undefined)
      .map(match => (ctx: PlanningContext) => Plan.fromMatch(match.address, match, this, ctx))
      .toArray()
      .reverse();
    producers.push(ctx => Type.isOpen(settled) ? undefined : this.#synthesize(settled, ctx));
    return producers
      .map(produce => this.#deliverElement(elementType, produce, context))
      .filter(isDefined);
  }

  /**
   * One collection element: passed through as it stands, or — for a promise-headed collection —
   * wrapped as its own boundary so the element arrives as a promise however its producer is registered.
   */
  #deliverElement(elementType: Type, produce: Func<[PlanningContext], Plan | undefined>, context: PlanningContext): Plan | undefined {
    if (!Type.isPromiseLike(elementType)) {
      return produce(context);
    }
    const built = this.#collect(context, () => produce(context));
    return built && this.#promiseNode(built.inner, built.descendants, elementType);
  }
}

/**
 * One pass's failure notes: the first type the pass found nothing to build from — a true leaf,
 * since a deeper failure always sets it first.
 */
interface PassDiagnostics {
  missingDependency: Type | undefined;
}

/**
 * The callable node `type` names through the value path's marker address — di.core's
 * `resolve(callableType, callable)` closes over it as `Invoker<typeof callableType>` — or
 * `undefined` when `type` is not that address.
 */
function invokerCallableType(type: ImportedType): ConstructorType | FunctionType | undefined {
  const [matched, generics] = Type.bindGenerics(typefor<Invoker<Generic<'C', Ctor | Func>>>(), type);
  const callableType = matched ? generics.C : undefined;
  return callableType?.kind === 'ctor' || callableType?.kind === 'func' ? callableType : undefined;
}

/**
 * Guards the pass against re-entering a type it is still planning: `visiting(type)` throws
 * {@link CycleError} on a repeat, and otherwise tracks the type for the extent of the `using`
 * block holding the returned disposable.
 */
class CycleGuard {
  readonly #visiting: Type[] = [];

  /** Whether the pass is already inside `address` — asked where re-entering it would be a false loop. */
  isVisiting(address: Type): boolean {
    return this.#visiting.includes(address);
  }

  visiting(address: Type): Disposable {
    if (this.#visiting.includes(address)) {
      throw new CycleError([...this.#visiting, address]);
    }
    this.#visiting.push(address);
    return {
      [Symbol.dispose]: () => {
        const left = this.#visiting.pop();
        if (left !== address) {
          throw new Error(
            `the planning pass unwound out of order — expected to leave "${address}" but left "${left ?? '<empty>'}"`,
          );
        }
      },
    };
  }
}
