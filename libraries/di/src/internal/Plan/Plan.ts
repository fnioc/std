import { type CtorRegistration, type FactoryRegistration, Registration, UnsatisfiableError } from '@rhombus-std/di.core';
import { type ConstructorType, type FunctionType, type ListType, type TupleType, Type, type UnionType } from '@rhombus-std/primitives';
import type { Ctor, Func } from '@rhombus-toolkit/func';
import { memo } from '@rhombus-toolkit/once';
import { assertNever, isAllThere, isDefined, isReadonlyArray } from '@rhombus-toolkit/type-guards';
import type { Match, Registry } from '../Registry.js';
import type { PlanHooks } from './InstalledHooks.js';
import { PlannerVisitor, type PlanningContext } from './PlannerVisitor.js';
import { type RealizeOptions, RealizeVisitor } from './RealizeVisitor.js';

export type Plan =
  | LateBoundArgPlan
  | RegisteredCtorPlan
  | RegisteredFactoryPlan
  | CtorPlan
  | FactoryPlan
  | LateBoundPlan
  | InvokerPlan
  | ConstantPlan
  | RequestPlan
  | IterablePlan
  | ArrayPlan
  | PromisePlan
  | RegisteredPromisePlan
  | AsyncPlan
  | AsyncIterablePlan;

/**
 * A registered constructor the engine `new`s up; {@link registration} is the matching
 * registration (absent for an engine-synthesized plan), and {@link populatedAddress} is its
 * address with the match's bindings filled in.
 */
export interface RegisteredCtorPlan {
  readonly kind: 'registered-ctor';
  readonly ctor: Ctor;
  readonly args: Plan[];
  /** A trailing plan realizing a list; its elements extend the call one argument each. */
  readonly rest?: Plan;
  readonly populatedAddress: Type;
  readonly registration: CtorRegistration<unknown>;
}

export interface RegisteredFactoryPlan {
  readonly kind: 'registered-factory';
  readonly factory: Func;
  readonly args: Plan[];
  /** A trailing plan realizing a list; its elements extend the call one argument each. */
  readonly rest?: Plan;
  readonly populatedAddress: Type;
  readonly registration: FactoryRegistration<unknown>;
}

/**
 * An engine-synthesized construction: no registration and no lifetime datum stands behind it, so
 * it lives outside the lifetime model's jurisdiction and realizes afresh on every call.
 */
export interface CtorPlan {
  readonly kind: 'ctor';
  readonly ctor: Ctor;
  readonly args: Plan[];
  /** A trailing plan realizing a list; its elements extend the call one argument each. */
  readonly rest?: Plan;
}

/** {@link Plan.Ctor}'s factory-shaped sibling. */
export interface FactoryPlan {
  readonly kind: 'factory';
  readonly factory: Func;
  readonly args: Plan[];
  /** A trailing plan realizing a list; its elements extend the call one argument each. */
  readonly rest?: Plan;
}

/** A latebound caller's argument, read off the realize context by position — a value plan. */
export interface LateBoundArgPlan {
  readonly kind: 'latebound-arg';
  readonly index: number;
}

export interface LateBoundPlan {
  readonly kind: 'latebound';
  readonly funcType: FunctionType;
}

/**
 * The value path: `callableType` is the constructor or factory node a caller's `resolve` call
 * supplies its own implementer against — {@link RegisteredCtorPlan}/
 * {@link RegisteredFactoryPlan}'s sibling for a callable that arrives at call time instead of
 * through a registration.
 */
export interface InvokerPlan {
  readonly kind: 'invoker';
  readonly callableType: ConstructorType | FunctionType;
}

export interface ConstantPlan {
  readonly kind: 'constant';
  readonly value: any;
}

/**
 * A slot naming one of the request classes — `Request`, `ServiceRequest` or `ControlRequest` —
 * answered at realize time with the ask in flight, when the ask is an instance of what
 * {@link address} names.
 */
export interface RequestPlan {
  readonly kind: 'request';
  readonly address: Type;
}

export interface IterablePlan {
  readonly kind: 'iterable';
  readonly types: readonly Plan[];
}

export interface ArrayPlan {
  readonly kind: 'array';
  readonly types: readonly Plan[];
}

/**
 * The async boundary: the wrapping promise a promise-addressed node hands over, minted afresh on
 * every ask. Everything in {@link descendants} is settled before {@link inner} realizes, which is
 * the one place a walk waits.
 */
export interface PromisePlan {
  readonly kind: 'promise';
  readonly inner: Plan;
  readonly descendants: readonly AsyncPlan[];
  readonly populatedAddress: Type;
}

/**
 * A registration answering the promise address itself: the wrapping promise is that
 * registration's own product, so the construction protocol runs at this node with
 * {@link envelope} as its make — the kept product is the promise the envelope mints.
 */
export interface RegisteredPromisePlan {
  readonly kind: 'registered-promise';
  readonly registration: Registration<unknown>;
  readonly envelope: PromisePlan;
}

/**
 * One dependency the enclosing boundary settles on this node's behalf: the boundary realizes
 * {@link inner} and awaits it, and the walk beneath reads the settled value from here. Its own
 * {@link descendants} settle before {@link inner} realizes, so the await this node hands up is
 * itself a boundary.
 */
export interface AsyncPlan {
  readonly kind: 'async';
  readonly inner: Plan;
  readonly descendants: readonly AsyncPlan[];
  /** The address the slot asked for — the settled shape, never the promise. */
  readonly address: Type;
}

/** Every element of a stepwise sequence, each its own boundary, settled as its step runs. */
export interface AsyncIterablePlan {
  readonly kind: 'async-iterable';
  readonly elements: readonly Plan[];
}

export namespace Plan {
  /**
   * A registered constructor the engine `new`s up.
   */
  export function registeredCtor(ctor: Ctor, args: Plan[], populatedAddress: Type, registration: CtorRegistration<unknown>): RegisteredCtorPlan;
  export function registeredCtor(spec: { ctor: Ctor; args: Plan[] | undefined; rest?: Plan; populatedAddress: Type; registration: CtorRegistration<unknown>; }): RegisteredCtorPlan | undefined;
  export function registeredCtor(...call: any[]): RegisteredCtorPlan | undefined {
    if (call.length > 1) {
      const [ctor, args, populatedAddress, registration] = call;
      return { kind: 'registered-ctor', ctor, args, populatedAddress, registration };
    }
    const spec = call[0];
    return spec.args && { kind: 'registered-ctor', ...spec };
  }
  /**
   * A registered factory the engine invokes — {@link args} realize its call.
   */
  export function registeredFactory(factory: Func, args: Plan[], populatedAddress: Type, registration: FactoryRegistration<unknown>): RegisteredFactoryPlan;
  export function registeredFactory(
    spec: { factory: Func; args: Plan[] | undefined; rest?: Plan; populatedAddress: Type; registration: FactoryRegistration<unknown>; },
  ): RegisteredFactoryPlan | undefined;
  export function registeredFactory(...call: any[]): RegisteredFactoryPlan | undefined {
    if (call.length > 1) {
      const [factory, args, populatedAddress, registration] = call;
      return { kind: 'registered-factory', factory, args, populatedAddress, registration };
    }
    const spec = call[0];
    return spec.args && { kind: 'registered-factory', ...spec };
  }
  /**
   * A function value handed back to the caller; each invocation realizes the plan for
   * {@link FunctionType.return | the return type}, the call's arguments serving every slot that
   * names their arg's type. The signature whose length matches the call's own arg count is
   * the one that binds.
   */
  export function latebound(funcType: FunctionType): LateBoundPlan {
    return { kind: 'latebound', funcType };
  }
  export function lateboundArg(index: number): LateBoundArgPlan {
    return { kind: 'latebound-arg', index };
  }
  /** The value path's own realization: a closure a caller invokes with their own implementer. */
  export function invoker(callableType: ConstructorType | FunctionType): InvokerPlan {
    return { kind: 'invoker', callableType };
  }
  export function ctor(ctor: Ctor, args: Plan[], rest?: Plan): CtorPlan {
    return { kind: 'ctor', ctor, args, rest };
  }
  export function factory(factory: Func, args: Plan[], rest?: Plan): FactoryPlan {
    return { kind: 'factory', factory, args, rest };
  }
  export function constant(value: any): ConstantPlan {
    return { kind: 'constant', value };
  }
  /** The ask in flight, checked against the request class `address` names when it is realized. */
  export function request(address: Type): RequestPlan {
    return { kind: 'request', address };
  }
  /**
   * Every registration serving one type, realized lazily and re-iterably: each resolution
   * constructs afresh, so a transient member yields a new instance per pass.
   */
  export function iterable(types: readonly Plan[]): IterablePlan {
    return { kind: 'iterable', types };
  }
  /** The same members as {@link IterablePlan}, realized eagerly into a fresh array per request. */
  export function array(types: readonly Plan[]): ArrayPlan {
    return { kind: 'array', types };
  }

  /**
   * The boundary wrapping `inner` — the node for `populatedAddress`, whose realization is the
   * promise `descendants` settles into.
   */
  export function promise(inner: Plan, descendants: readonly AsyncPlan[], populatedAddress: Type): PromisePlan {
    return { kind: 'promise', inner, descendants, populatedAddress };
  }

  /**
   * The boundary for an address `inner`'s own registration answered: the construction demotes to
   * the envelope's plain make and the registration rides this node — one node per address, so the
   * two never both claim it.
   */
  export function registeredPromise(inner: RegisteredCtorPlan | RegisteredFactoryPlan, descendants: readonly AsyncPlan[], populatedAddress: Type): RegisteredPromisePlan {
    const make = inner.kind === 'registered-ctor' ? Plan.ctor(inner.ctor, inner.args, inner.rest) : Plan.factory(inner.factory, inner.args, inner.rest);
    return { kind: 'registered-promise', registration: inner.registration, envelope: Plan.promise(make, descendants, populatedAddress) };
  }

  /** A dependency the enclosing boundary settles: `address` is what the slot asked for, and `descendants` are the awaits beneath it. */
  export function async(inner: Plan, descendants: readonly AsyncPlan[], address: Type): AsyncPlan {
    return { kind: 'async', inner, descendants, address };
  }

  /**
   * A sequence whose steps settle one at a time: each element is a boundary of its own, so an
   * element nobody iterates is never realized.
   */
  export function asyncIterable(elements: readonly Plan[]): AsyncIterablePlan {
    return { kind: 'async-iterable', elements };
  }

  /**
   * The plan for a request, built once and kept for as long as its registry lives.
   *
   * @remarks
   * A plan is a pure function of the interned request and the registry's fixed registrations —
   * building it reads no runtime state — so the second ask for a request can only rebuild the same
   * tree; it holds no instances. A request that cannot be satisfied caches nothing, so the
   * failure is rebuilt and rethrown identically. The signature form is the latebound plan —
   * each arg type binding the call position that supplies it — memoized per signature; the map
   * form is the raw uncached build the memoized forms bottom out in.
   *
   * @throws {UnsatisfiableError} when {@link address} has no registration, or has one whose
   * own dependencies cannot be met.
   */
  export const from = (() => {
    // The pass's hook context rides beside the memo rather than through it: it is not part of the
    // plan's identity — whichever ask makes the plan supplies the hooks that fire — and planning
    // is synchronous, so the slot is set only for the extent of one build.
    let currentHooks: PlanHooks | undefined;

    const planFor = memo((registry: Registry) =>
      memo((address: Type) =>
        memo((args: ReadonlyMap<Type, number>) => {
          const visitor = new PlannerVisitor(registry, args, currentHooks);
          const plan = visitor.visit(address);
          if (plan === undefined) {
            // Two failures reach here and a caller acts on them differently: nothing is registered
            // for the request at all, or something is and the graph beneath it has the hole.
            const registered = registry.hasMatch(address);
            // The planning pass's own leaf failure, when it lies beneath address rather than being
            // address itself, names the actual dependency that could not be met.
            const missing = visitor.missingDependency;
            const cause = missing !== undefined && missing !== address
              ? new UnsatisfiableError(missing, 'nothing in the manifest produces it')
              : undefined;
            throw new UnsatisfiableError(
              address,
              registered
                ? 'it is registered, but something it needs is not'
                : 'nothing in the manifest produces it',
              cause,
            );
          }
          return plan;
        })
      )
    );

    // Reversed so a repeated arg type keeps its FIRST index — Map insertion lets the last write win.
    // Memoized so the map's identity is stable per signature, which is what the plan memo keys on.
    const toArgs = memo((signature: readonly Type[]) => new Map(signature.map((argType, index) => [argType, index] as const).reverse()));

    /** The plain request's args: nothing bound. */
    const NO_ARGS: ReadonlyMap<Type, number> = new Map();
    function from(address: Type, registry: Registry, hooks?: PlanHooks): Plan;
    function from(address: Type, registry: Registry, signature: readonly Type[], hooks?: PlanHooks): Plan;
    function from(address: Type, registry: Registry, args: ReadonlyMap<Type, number>, hooks?: PlanHooks): Plan;
    function from(address: Type, registry: Registry, third?: readonly Type[] | ReadonlyMap<Type, number> | PlanHooks, fourth?: PlanHooks): Plan {
      if (isReadonlyArray(third)) {
        return from(address, registry, toArgs(third), fourth);
      }
      let args: ReadonlyMap<Type, number>;
      let hooks: PlanHooks | undefined;
      if (third !== undefined && 'installed' in third) {
        args = NO_ARGS;
        hooks = third;
      } else {
        args = third ?? NO_ARGS;
        hooks = fourth;
      }
      const previous = currentHooks;
      currentHooks = hooks;
      try {
        return planFor(registry)(address)(args);
      } finally {
        currentHooks = previous;
      }
    }

    return from;
  })();

  /**
   * Lowers `registration` as an invocation frame: nothing is registered, no lifetime datum stands
   * behind the construction, and dependencies lower against `registry` as usual — so the plan
   * comes back synthesized, outside the lifetime model's jurisdiction.
   */
  export function fromRegistration(registration: Registration<unknown>, registry: Registry, hooks?: PlanHooks): Plan | undefined {
    const visitor = new PlannerVisitor(registry, undefined, hooks);
    const [kind, narrowed] = Registration.kind(registration);
    switch (kind) {
      case 'ctor': {
        const lowered = lowerSignature(narrowed.ctorType.signatures, Object.create(null), visitor);
        return lowered && Plan.ctor(narrowed.ctor, lowered[0], lowered[1]);
      }
      case 'factory': {
        const lowered = lowerSignature(narrowed.factoryType.signatures, Object.create(null), visitor);
        return lowered && Plan.factory(narrowed.factory, lowered[0], lowered[1]);
      }
      case 'value':
        return Plan.constant(narrowed.value);
      default:
        return assertNever(narrowed);
    }
  }

  /**
   * Lowers a registration the registry matched to a request, closing it over whatever the match
   * captured. `visitor` supplies the recursion that turns each signature arg into the plan
   * producing it. Undefined when no signature has every arg satisfiable.
   *
   * @remarks
   * A slot naming the registration's own address resolves BENEATH it: matching starts after the
   * registration being planned, so a factory for `Foo` shaped `Func<[Foo], Foo>` receives what it
   * shadows rather than itself.
   */
  export function fromMatch(populatedAddress: Type, match: Match, visitor: PlannerVisitor, context: PlanningContext): Plan | undefined {
    const { registration: wideRegistration, generics } = match;
    const slots: SlotLowering = {
      visit: address => address === populatedAddress ? visitor.visitBeneath(address, match.index, context) : visitor.visit(address, context),
    };
    const [kind, registration] = Registration.kind(wideRegistration);
    // The node is made before its slots lower, so the plan hooks receive the very node the plan
    // will hold and their answer stands while the dependencies are planned.
    switch (kind) {
      case 'ctor': {
        const node: Making<RegisteredCtorPlan> = { kind: 'registered-ctor', ctor: registration.ctor, args: [], rest: undefined, populatedAddress, registration };
        const lowered = lowerPlanned(node, registration.ctorType.signatures, generics, slots, visitor);
        if (lowered === undefined) {
          return undefined;
        }
        [node.args, node.rest] = lowered;
        return node;
      }
      case 'factory': {
        const node: Making<RegisteredFactoryPlan> = { kind: 'registered-factory', factory: registration.factory, args: [], rest: undefined, populatedAddress, registration };
        const lowered = lowerPlanned(node, registration.factoryType.signatures, generics, slots, visitor);
        if (lowered === undefined) {
          return undefined;
        }
        [node.args, node.rest] = lowered;
        return node;
      }
      case 'value': {
        return Plan.constant(registration.value);
      }
      default:
        return assertNever(registration);
    }
  }

  /** A plan node while it is being made — its slots land once they have lowered. */
  type Making<Node> = { -readonly [K in keyof Node]: Node[K]; };

  /** Lowers a registered node's signature under the plan hooks fired for the node. */
  function lowerPlanned(
    node: Making<RegisteredCtorPlan> | Making<RegisteredFactoryPlan>,
    signatures: TupleType | ListType | UnionType,
    generics: Readonly<Record<string, Type>>,
    slots: SlotLowering,
    visitor: PlannerVisitor,
  ): [args: Plan[], rest: Plan | undefined] | undefined {
    const previous = visitor.openPlanned(node, node.populatedAddress, node.registration);
    try {
      return lowerSignature(signatures, generics, slots);
    } finally {
      visitor.closePlanned(previous);
    }
  }

  /** What lowers one slot: the planner's own visit, or a view routing a self-named slot beneath its registration. */
  interface SlotLowering {
    visit(address: Type): Plan | undefined;
  }

  /**
   * The first signature whose every arg lowers to a plan, longest first — a row's length is its
   * fixed slot count, so a rest-only row is the last resort and equal lengths keep the slot's
   * stored order. An arg that IS a hole receives its closing type as a constant — an erased type
   * parameter has nothing else to run on — while a hole inside a larger arg closes into that
   * expression and resolves as any other dependency.
   */
  function lowerSignature(
    signatures: TupleType | ListType | UnionType,
    generics: Readonly<Record<string, Type>>,
    visitor: SlotLowering,
  ): [args: Plan[], rest: Plan | undefined] | undefined {
    return Iterator.from(Type.signatureRows(signatures).toSorted((a, b) => fixedLength(b) - fixedLength(a)))
      .map(row => lowerRow(row, generics, visitor))
      .find(isDefined);
  }

  function fixedLength(row: TupleType | ListType): number {
    return row.kind === 'tuple' ? row.members.length : 0;
  }

  /** One row's args as plans — the fixed slots each their own, the open length as one list plan. */
  function lowerRow(
    row: TupleType | ListType,
    generics: Readonly<Record<string, Type>>,
    visitor: SlotLowering,
  ): [args: Plan[], rest: Plan | undefined] | undefined {
    const list = restList(row);
    const rest = list === undefined ? undefined : lowerArg(list, generics, visitor);
    if (list !== undefined && rest === undefined) {
      return undefined;
    }
    const members = row.kind === 'tuple' ? row.members : [];
    const args = members.map(arg => lowerArg(arg, generics, visitor));
    return isAllThere(args) ? [args, rest] : undefined;
  }

  /**
   * The list a row's open length draws from: a rest-only row is its own list; a tuple's rest slot
   * draws from an array of its element.
   *
   * @throws TypeError - when the row is neither a tuple nor a list: such a row can only be a
   * forged node that reached planning unvalidated, and it has no argument list to plan.
   */
  function restList(row: TupleType | ListType): Type | undefined {
    if (row.kind === 'tuple') {
      return row.rest === undefined ? undefined : Type.array(row.rest);
    }
    if (row.kind !== 'array' && row.kind !== 'iterable') {
      throw new TypeError(`a ${(row as Type).kind} row reached planning unvalidated — no factory builds it into a signatures slot`);
    }
    return row;
  }

  function lowerArg(arg: Type, generics: Readonly<Record<string, Type>>, visitor: SlotLowering): Plan | undefined {
    if (arg.kind === 'generic') {
      const closing = generics[arg.label];
      return closing && Plan.constant(closing);
    }
    return visitor.visit(Type.substitute(arg, generics));
  }

  export function realize(plan: Plan, options: RealizeOptions): any {
    return new RealizeVisitor(options).realize(plan, options.context);
  }
}
