import { ServiceDescriptor } from '@rhombus-std/di.core';
import { type FunctionType, isAllThere, Type } from '@rhombus-std/primitives';
import type { Ctor, Func } from '@rhombus-toolkit/func';
import { assertNever } from '@rhombus-toolkit/type-guards';
import type { Answer, Registry } from '../Registry.js';
import { realizeCallSite } from './RealizeVisitor.js';
import { ToCallSiteVisitor } from './ToCallSiteVisitor.js';

export type { RealizeOptions as RealizeContext } from './RealizeVisitor.js';

export type CallSite =
  | ArgCallSite
  | CtorCallSite
  | FactoryCallSite
  | LateBoundCallSite
  | ConstantCallSite
  | ServiceProviderCallSite
  | IterableCallSite
  | ArrayCallSite;

/**
 * A registered constructor the engine `new`s up. {@link serviceType} is the type as requested;
 * {@link descriptor} is the answering registration — the join the lifetime model reads — and is
 * absent for an engine-synthesized site.
 */
export interface CtorCallSite {
  readonly kind: 'ctor';
  readonly ctor: Ctor;
  readonly args: CallSite[];
  readonly serviceType: Type;
  readonly descriptor: ServiceDescriptor<unknown> | undefined;
}
export interface FactoryCallSite {
  readonly kind: 'factory';
  readonly factory: Func;
  readonly args: CallSite[];
  readonly serviceType: Type;
  readonly descriptor: ServiceDescriptor<unknown> | undefined;
}
export interface LateBoundCallSite {
  readonly kind: 'latebound';
  readonly funcType: FunctionType;
}
/** A latebound caller's argument, read off the realize context by position — a value site. */
export interface ArgCallSite {
  readonly kind: 'arg';
  readonly index: number;
}
export interface ConstantCallSite {
  readonly kind: 'constant';
  readonly value: any;
}
export interface ServiceProviderCallSite {
  readonly kind: 'service-provider';
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
  export function ctor(ctor: Ctor, args: CallSite[], serviceType: Type, descriptor?: ServiceDescriptor<unknown>): CtorCallSite;
  export function ctor(spec: { ctor: Ctor; args: CallSite[] | undefined; serviceType: Type; descriptor?: ServiceDescriptor<unknown>; }): CtorCallSite | undefined;
  export function ctor(...call: any[]): CtorCallSite | undefined {
    if (call.length > 1) {
      const [ctor, args, serviceType, descriptor] = call;
      return { kind: 'ctor', ctor, args, serviceType, descriptor };
    }
    const spec = call[0];
    return spec.args && { kind: 'ctor', ...spec };
  }
  /**
   * A registered factory the engine invokes — {@link args} realize its call.
   */
  export function factory(factory: Func, args: CallSite[], serviceType: Type, descriptor?: ServiceDescriptor<unknown>): FactoryCallSite;
  export function factory(spec: { factory: Func; args: CallSite[] | undefined; serviceType: Type; descriptor?: ServiceDescriptor<unknown>; }): FactoryCallSite | undefined;
  export function factory(...call: any[]): FactoryCallSite | undefined {
    if (call.length > 1) {
      const [factory, args, serviceType, descriptor] = call;
      return { kind: 'factory', factory, args, serviceType, descriptor };
    }
    const spec = call[0];
    return spec.args && { kind: 'factory', ...spec };
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
  export function arg(index: number): ArgCallSite {
    return { kind: 'arg', index };
  }
  export function constant(value: any): ConstantCallSite {
    return { kind: 'constant', value };
  }
  export function serviceProvider(): ServiceProviderCallSite {
    return { kind: 'service-provider' };
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

  export function from(serviceType: Type, registry: Registry, args?: ReadonlyMap<Type, number>): CallSite | undefined {
    return new ToCallSiteVisitor(registry, args).visit(serviceType);
  }

  /**
   * Lowers `descriptor` as the ready-made answer for its own service type — an invocation
   * frame's plan: nothing is registered, and dependencies lower against `registry` as usual.
   */
  export function fromDescriptor(descriptor: ServiceDescriptor<unknown>, registry: Registry): CallSite | undefined {
    return fromAnswer(descriptor.serviceType, { descriptor, generics: new Map() }, new ToCallSiteVisitor(registry));
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
        return ctor({
          ctor: descriptor.ctor,
          args: lowerSignature(descriptor.ctorType.signatures, generics, visitor),
          serviceType,
          descriptor: wideDesc,
        });
      }
      case 'factory': {
        return factory({
          factory: descriptor.factory,
          args: lowerSignature(descriptor.factoryType.signatures, generics, visitor),
          serviceType,
          descriptor: wideDesc,
        });
      }
      case 'value': {
        return constant(descriptor.value);
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
      return closing && constant(closing);
    }
    return visitor.visit(generics.size ? Type.substitute(arg, generics) : arg);
  }

  export const realize = realizeCallSite;
}
