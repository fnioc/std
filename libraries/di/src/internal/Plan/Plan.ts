import { type CtorRegistration, type FactoryRegistration, Registration, UnsatisfiableError } from '@rhombus-std/di.core';
import { type ConstructorType, type FunctionType, isAllThere, Type } from '@rhombus-std/primitives';
import { memo } from '@rhombus-std/primitives';
import type { Ctor, Func } from '@rhombus-toolkit/func';
import { assertNever } from '@rhombus-toolkit/type-guards';
import type { Match, Registry } from '../Registry.js';
import { PlannerVisitor } from './PlannerVisitor.js';
import { realizePlan } from './RealizeVisitor.js';

export type { RealizeOptions } from './RealizeVisitor.js';

export type Plan =
  | LateBoundArgPlan
  | RegisteredCtorPlan
  | RegisteredFactoryPlan
  | CtorPlan
  | FactoryPlan
  | LateBoundPlan
  | InvokerPlan
  | ConstantPlan
  | ServiceProviderPlan
  | StarfishPlan
  | IterablePlan
  | ArrayPlan;

/**
 * A registered constructor the engine `new`s up; {@link registration} is the matching
 * registration (absent for an engine-synthesized plan), and {@link populatedAddress} is its
 * address with the match's bindings filled in.
 */
export interface RegisteredCtorPlan {
  readonly kind: 'registered-ctor';
  readonly ctor: Ctor;
  readonly args: Plan[];
  readonly populatedAddress: Type;
  readonly registration: CtorRegistration<unknown>;
}

export interface RegisteredFactoryPlan {
  readonly kind: 'registered-factory';
  readonly factory: Func;
  readonly args: Plan[];
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
}

/** {@link Plan.Ctor}'s factory-shaped sibling. */
export interface FactoryPlan {
  readonly kind: 'factory';
  readonly factory: Func;
  readonly args: Plan[];
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

/** A dependency slot naming `IServiceProvider`; {@link address} is the spelling that reached it. */
export interface ServiceProviderPlan {
  readonly kind: 'service-provider';
  readonly address: Type;
}

/** The hook door, realized into the two-stage function a provider binds itself into the engine with. */
export interface StarfishPlan {
  readonly kind: 'starfish';
}

export interface IterablePlan {
  readonly kind: 'iterable';
  readonly types: readonly Plan[];
}

export interface ArrayPlan {
  readonly kind: 'array';
  readonly types: readonly Plan[];
}

const STARFISH: StarfishPlan = { kind: 'starfish' };

export namespace Plan {
  /**
   * A registered constructor the engine `new`s up.
   */
  export function registeredCtor(ctor: Ctor, args: Plan[], populatedAddress: Type, registration: CtorRegistration<unknown>): RegisteredCtorPlan;
  export function registeredCtor(spec: { ctor: Ctor; args: Plan[] | undefined; populatedAddress: Type; registration: CtorRegistration<unknown>; }): RegisteredCtorPlan | undefined;
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
  export function registeredFactory(spec: { factory: Func; args: Plan[] | undefined; populatedAddress: Type; registration: FactoryRegistration<unknown>; }): RegisteredFactoryPlan | undefined;
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
  export function ctor(ctor: Ctor, args: Plan[]): CtorPlan {
    return { kind: 'ctor', ctor, args };
  }
  export function factory(factory: Func, args: Plan[]): FactoryPlan {
    return { kind: 'factory', factory, args };
  }
  export function constant(value: any): ConstantPlan {
    return { kind: 'constant', value };
  }
  export function serviceProvider(address: Type): ServiceProviderPlan {
    return { kind: 'service-provider', address };
  }
  export function starfish(): StarfishPlan {
    return STARFISH;
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
    const planFor = memo((registry: Registry) =>
      memo((address: Type) =>
        memo((args: ReadonlyMap<Type, number>) => {
          const visitor = new PlannerVisitor(registry, args);
          const plan = visitor.visit(address);
          if (plan === undefined) {
            // Two failures reach here and a caller acts on them differently: nothing is registered
            // for the request at all, or something is and the graph beneath it has the hole. An
            // open request cannot be asked which it is — matching one against a registration binds
            // holes, and a hole on the asking side has nothing to bind to — so it reports the
            // absence it can stand behind.
            const registered = !Type.isOpen(address) && !registry.matching(address).next().done;
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

    function from(address: Type, registry: Registry): Plan;
    function from(address: Type, registry: Registry, signature: readonly Type[]): Plan;
    function from(address: Type, registry: Registry, args: ReadonlyMap<Type, number>): Plan;
    function from(address: Type, registry: Registry, args?: readonly Type[] | ReadonlyMap<Type, number>): Plan {
      if (Array.isArray(args)) {
        return from(address, registry, toArgs(args));
      }
      return planFor(registry)(address)((args as ReadonlyMap<Type, number> | undefined) ?? NO_ARGS);
    }

    return from;
  })();

  /**
   * Lowers `registration` as an invocation frame: nothing is registered, no lifetime datum stands
   * behind the construction, and dependencies lower against `registry` as usual — so the plan
   * comes back synthesized, outside the lifetime model's jurisdiction.
   */
  export function fromRegistration(registration: Registration<unknown>, registry: Registry): Plan | undefined {
    const visitor = new PlannerVisitor(registry);
    const [kind, narrowed] = Registration.kind(registration);
    switch (kind) {
      case 'ctor': {
        const args = lowerSignature(narrowed.ctorType.signatures, new Map(), visitor);
        return args && Plan.ctor(narrowed.ctor, args);
      }
      case 'factory': {
        const args = lowerSignature(narrowed.factoryType.signatures, new Map(), visitor);
        return args && Plan.factory(narrowed.factory, args);
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
   */
  export function fromMatch(populatedAddress: Type, match: Match, visitor: Type.Visitor<Plan | undefined>): Plan | undefined {
    const { registration: wideRegistration, generics } = match;
    const [kind, registration] = Registration.kind(wideRegistration);
    switch (kind) {
      case 'ctor': {
        return Plan.registeredCtor({
          ctor: registration.ctor,
          args: lowerSignature(registration.ctorType.signatures, generics, visitor),
          populatedAddress,
          registration,
        });
      }
      case 'factory': {
        return Plan.registeredFactory({
          factory: registration.factory,
          args: lowerSignature(registration.factoryType.signatures, generics, visitor),
          populatedAddress,
          registration,
        });
      }
      case 'value': {
        return Plan.constant(registration.value);
      }
      default:
        return assertNever(registration);
    }
  }

  /**
   * The first signature whose every arg lowers to a plan, longest first. An arg that IS a
   * hole receives its closing type as a constant — an erased type parameter has nothing else to
   * run on — while a hole inside a larger arg closes into that expression and resolves as any
   * other dependency.
   */
  function lowerSignature(signatures: Type.Signatures, generics: ReadonlyMap<string, Type>, visitor: Type.Visitor<Plan | undefined>): Plan[] | undefined {
    return Iterator.from(signatures.toSorted((a, b) => b.length - a.length))
      .map(signature => signature.map(arg => lowerArg(arg, generics, visitor)))
      .find(isAllThere);
  }

  function lowerArg(arg: Type, generics: ReadonlyMap<string, Type>, visitor: Type.Visitor<Plan | undefined>): Plan | undefined {
    if (arg.kind === 'generic') {
      const closing = generics.get(arg.label);
      return closing && Plan.constant(closing);
    }
    return visitor.visit(generics.size ? Type.substitute(arg, generics) : arg);
  }

  export const realize = realizePlan;
}
