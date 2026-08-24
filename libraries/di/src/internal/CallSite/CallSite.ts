import { type CtorDescriptor, type FactoryDescriptor, ServiceDescriptor, UnsatisfiableError } from '@rhombus-std/di.core';
import { type ConstructorType, type FunctionType, isAllThere, Type } from '@rhombus-std/primitives';
import { memo } from '@rhombus-std/primitives';
import type { Ctor, Func } from '@rhombus-toolkit/func';
import { assertNever } from '@rhombus-toolkit/type-guards';
import type { Answer, Registry } from '../Registry.js';
import { realizeCallSite } from './RealizeVisitor.js';
import { ToCallSiteVisitor } from './ToCallSiteVisitor.js';

export type { RealizeOptions } from './RealizeVisitor.js';

export type CallSite =
  | LateBoundArgCallSite
  | RegisteredCtorCallSite
  | RegisteredFactoryCallSite
  | CtorCallSite
  | FactoryCallSite
  | LateBoundCallSite
  | InvokerCallSite
  | ConstantCallSite
  | ServiceProviderCallSite
  | ScopeFactoryCallSite
  | IterableCallSite
  | ArrayCallSite;

/**
 * A registered constructor the engine `new`s up. {@link serviceType} is the type as requested;
 * {@link descriptor} is the answering registration — the join the lifetime model reads — and is
 * absent for an engine-synthesized site.
 */
export interface RegisteredCtorCallSite {
  readonly kind: 'registered-ctor';
  readonly ctor: Ctor;
  readonly args: CallSite[];
  readonly serviceType: Type;
  readonly descriptor: CtorDescriptor<unknown>;
}

export interface RegisteredFactoryCallSite {
  readonly kind: 'registered-factory';
  readonly factory: Func;
  readonly args: CallSite[];
  readonly serviceType: Type;
  readonly descriptor: FactoryDescriptor<unknown>;
}

/**
 * An engine-synthesized construction: no registration and no lifetime datum stands behind it, so
 * it lives outside the lifetime model's jurisdiction and realizes afresh on every call.
 */
export interface CtorCallSite {
  readonly kind: 'ctor';
  readonly ctor: Ctor;
  readonly args: CallSite[];
}

/** {@link CallSite.Ctor}'s factory-shaped sibling. */
export interface FactoryCallSite {
  readonly kind: 'factory';
  readonly factory: Func;
  readonly args: CallSite[];
}

/** A latebound caller's argument, read off the realize context by position — a value site. */
export interface LateBoundArgCallSite {
  readonly kind: 'latebound-arg';
  readonly index: number;
}

export interface LateBoundCallSite {
  readonly kind: 'latebound';
  readonly funcType: FunctionType;
}

/**
 * The value path: `callableType` is the constructor or factory node a caller's `resolve` call
 * supplies its own implementer against — {@link RegisteredCtorCallSite}/
 * {@link RegisteredFactoryCallSite}'s sibling for a callable that arrives at call time instead of
 * through a registration.
 */
export interface InvokerCallSite {
  readonly kind: 'invoker';
  readonly callableType: ConstructorType | FunctionType;
}

export interface ConstantCallSite {
  readonly kind: 'constant';
  readonly value: any;
}

export interface ServiceProviderCallSite {
  readonly kind: 'service-provider';
}

/**
 * The address a model publishes its scope-opening capability under. Engine-synthesized, the
 * same way {@link InvokerCallSite} answers a structurally-detected marker rather than a
 * registration — and synthesized only for a container whose model scopes at all.
 */
export interface ScopeFactoryCallSite {
  readonly kind: 'scope-factory';
}

export interface IterableCallSite {
  readonly kind: 'iterable';
  readonly types: readonly CallSite[];
}

export interface ArrayCallSite {
  readonly kind: 'array';
  readonly types: readonly CallSite[];
}

export namespace CallSite {
  /**
   * A registered constructor the engine `new`s up.
   */
  export function registeredCtor(ctor: Ctor, args: CallSite[], serviceType: Type, descriptor: CtorDescriptor<unknown>): RegisteredCtorCallSite;
  export function registeredCtor(spec: { ctor: Ctor; args: CallSite[] | undefined; serviceType: Type; descriptor: CtorDescriptor<unknown>; }): RegisteredCtorCallSite | undefined;
  export function registeredCtor(...call: any[]): RegisteredCtorCallSite | undefined {
    if (call.length > 1) {
      const [ctor, args, serviceType, descriptor] = call;
      return { kind: 'registered-ctor', ctor, args, serviceType, descriptor };
    }
    const spec = call[0];
    return spec.args && { kind: 'registered-ctor', ...spec };
  }
  /**
   * A registered factory the engine invokes — {@link args} realize its call.
   */
  export function registeredFactory(factory: Func, args: CallSite[], serviceType: Type, descriptor: FactoryDescriptor<unknown>): RegisteredFactoryCallSite;
  export function registeredFactory(spec: { factory: Func; args: CallSite[] | undefined; serviceType: Type; descriptor: FactoryDescriptor<unknown>; }): RegisteredFactoryCallSite | undefined;
  export function registeredFactory(...call: any[]): RegisteredFactoryCallSite | undefined {
    if (call.length > 1) {
      const [factory, args, serviceType, descriptor] = call;
      return { kind: 'registered-factory', factory, args, serviceType, descriptor };
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
  export function latebound(funcType: FunctionType): LateBoundCallSite {
    return { kind: 'latebound', funcType };
  }
  export function lateboundArg(index: number): LateBoundArgCallSite {
    return { kind: 'latebound-arg', index };
  }
  /** The value path's own realization: a closure a caller invokes with their own implementer. */
  export function invoker(callableType: ConstructorType | FunctionType): InvokerCallSite {
    return { kind: 'invoker', callableType };
  }
  export function ctor(ctor: Ctor, args: CallSite[]): CtorCallSite {
    return { kind: 'ctor', ctor, args };
  }
  export function factory(factory: Func, args: CallSite[]): FactoryCallSite {
    return { kind: 'factory', factory, args };
  }
  export function constant(value: any): ConstantCallSite {
    return { kind: 'constant', value };
  }
  export function serviceProvider(): ServiceProviderCallSite {
    return { kind: 'service-provider' };
  }
  export function scopeFactory(): ScopeFactoryCallSite {
    return { kind: 'scope-factory' };
  }
  /**
   * Every registration serving one type, realized lazily and re-iterably: each walk constructs
   * afresh, so a transient member yields a new instance per pass.
   */
  export function iterable(types: readonly CallSite[]): IterableCallSite {
    return { kind: 'iterable', types };
  }
  /** The same members as {@link IterableCallSite}, realized eagerly into a fresh array per request. */
  export function array(types: readonly CallSite[]): ArrayCallSite {
    return { kind: 'array', types };
  }

  /**
   * The plan for a request, built once and kept for as long as its registry lives.
   *
   * @remarks
   * A plan is a pure function of the interned request and the registry's fixed registrations —
   * the walk reads no runtime state — so the second ask for a request can only rebuild the same
   * tree; it holds no instances. A request that cannot be satisfied caches nothing, so the
   * failure is rebuilt and rethrown identically. The signature form is the latebound plan —
   * each arg type binding the call position that supplies it — memoized per signature; the map
   * form is the raw uncached build the memoized forms bottom out in.
   *
   * @throws {UnsatisfiableError} when nothing in the manifest can produce {@link serviceType}.
   */
  export const from = (() => {
    const planFor = memo((registry: Registry) =>
      memo((serviceType: Type) =>
        memo((args: ReadonlyMap<Type, number>) => {
          const site = new ToCallSiteVisitor(registry, args).visit(serviceType);
          if (site === undefined) {
            throw new UnsatisfiableError(serviceType, 'nothing in the manifest can produce it');
          }
          return site;
        })
      )
    );

    // Reversed so a repeated arg type keeps its FIRST index — Map insertion lets the last write win.
    // Memoized so the map's identity is stable per signature, which is what the plan memo keys on.
    const toArgs = memo((signature: readonly Type[]) => new Map(signature.map((argType, index) => [argType, index] as const).reverse()));

    /** The plain request's args: nothing bound. */
    const NO_ARGS: ReadonlyMap<Type, number> = new Map();

    function from(serviceType: Type, registry: Registry): CallSite;
    function from(serviceType: Type, registry: Registry, signature: readonly Type[]): CallSite;
    function from(serviceType: Type, registry: Registry, args: ReadonlyMap<Type, number>): CallSite;
    function from(serviceType: Type, registry: Registry, args?: readonly Type[] | ReadonlyMap<Type, number>): CallSite {
      if (Array.isArray(args)) {
        return from(serviceType, registry, toArgs(args));
      }
      return planFor(registry)(serviceType)((args as ReadonlyMap<Type, number> | undefined) ?? NO_ARGS);
    }

    return from;
  })();

  /**
   * Lowers `descriptor` as an invocation frame: nothing is registered, no lifetime datum stands
   * behind the construction, and dependencies lower against `registry` as usual — so the site
   * comes back synthesized, outside the lifetime model's jurisdiction.
   */
  export function fromDescriptor(descriptor: ServiceDescriptor<unknown>, registry: Registry): CallSite | undefined {
    const visitor = new ToCallSiteVisitor(registry);
    const [kind, narrowed] = ServiceDescriptor.kind(descriptor);
    switch (kind) {
      case 'ctor': {
        const args = lowerSignature(narrowed.ctorType.signatures, new Map(), visitor);
        return args && CallSite.ctor(narrowed.ctor, args);
      }
      case 'factory': {
        const args = lowerSignature(narrowed.factoryType.signatures, new Map(), visitor);
        return args && CallSite.factory(narrowed.factory, args);
      }
      case 'value':
        return CallSite.constant(narrowed.value);
      default:
        return assertNever(narrowed);
    }
  }

  /**
   * Lowers a registration the registry matched to a request, closing it over whatever the match
   * captured. `visitor` supplies the recursion that turns each signature arg into the call
   * site producing it. Undefined when no signature has every arg satisfiable.
   */
  export function fromAnswer(serviceType: Type, answer: Answer, visitor: Type.Visitor<CallSite | undefined>): CallSite | undefined {
    const { descriptor: wideDesc, generics } = answer;
    const [kind, descriptor] = ServiceDescriptor.kind(wideDesc);
    switch (kind) {
      case 'ctor': {
        return CallSite.registeredCtor({
          ctor: descriptor.ctor,
          args: lowerSignature(descriptor.ctorType.signatures, generics, visitor),
          serviceType,
          descriptor,
        });
      }
      case 'factory': {
        return CallSite.registeredFactory({
          factory: descriptor.factory,
          args: lowerSignature(descriptor.factoryType.signatures, generics, visitor),
          serviceType,
          descriptor,
        });
      }
      case 'value': {
        return CallSite.constant(descriptor.value);
      }
      default:
        return assertNever(descriptor);
    }
  }

  /**
   * The first signature whose every arg lowers to a call site, longest first. An arg that IS a
   * hole receives its closing type as a constant — an erased type parameter has nothing else to
   * run on — while a hole inside a larger arg closes into that expression and resolves as any
   * other dependency.
   */
  function lowerSignature(signatures: Type.Signatures, generics: ReadonlyMap<string, Type>, visitor: Type.Visitor<CallSite | undefined>): CallSite[] | undefined {
    return Iterator.from(signatures.toSorted((a, b) => b.length - a.length))
      .map(signature => signature.map(arg => lowerArg(arg, generics, visitor)))
      .find(isAllThere);
  }

  function lowerArg(arg: Type, generics: ReadonlyMap<string, Type>, visitor: Type.Visitor<CallSite | undefined>): CallSite | undefined {
    if (arg.kind === 'generic') {
      const closing = generics.get(arg.label);
      return closing && CallSite.constant(closing);
    }
    return visitor.visit(generics.size ? Type.substitute(arg, generics) : arg);
  }

  export const realize = realizeCallSite;
}
