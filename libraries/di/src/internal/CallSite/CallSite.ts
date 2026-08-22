import { ServiceDescriptor } from '@rhombus-std/di.core';
import { isAllThere, Type } from '@rhombus-std/primitives';
import type { Ctor, Func } from '@rhombus-toolkit/func';
import { assertNever } from '@rhombus-toolkit/type-guards';
import type { Answer, Registry } from '../Registry.js';
import { realizeCallSite } from './RealizeVisitor.js';
import { ToCallSiteVisitor } from './ToCallSiteVisitor.js';

export type { RealizeContext } from './RealizeVisitor.js';

export type CallSite =
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
  readonly result: Type;
  readonly lateBoundArgs: Type.Signatures;
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
  export function ctor(ctor: Ctor, args: CallSite[], serviceType: Type, descriptor?: ServiceDescriptor<unknown>): CtorCallSite {
    return { kind: 'ctor', ctor, args, serviceType, descriptor };
  }
  /**
   * A registered factory the engine invokes — {@link args} realize its parameters.
   */
  export function factory(factory: Func, args: CallSite[], serviceType: Type, descriptor?: ServiceDescriptor<unknown>): FactoryCallSite {
    return { kind: 'factory', factory, args, serviceType, descriptor };
  }
  /**
   * A function value handed back to the caller; each invocation re-enters the engine to resolve
   * {@link result}, the call's arguments registered as values for {@link lateBoundArgs}, in order.
   * The row named is the one whose length the call's own argument count matches, so a function
   * answering to several calls binds each of them under its own parameter types.
   */
  export function latebound(result: Type, lateBoundArgs: Type.Signatures): LateBoundCallSite {
    return { kind: 'latebound', result, lateBoundArgs };
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

  export function from(serviceType: Type, registry: Registry): CallSite | undefined {
    return new ToCallSiteVisitor(registry).visit(serviceType);
  }

  /**
   * Lowers a registration the registry matched to a request, closing it over whatever the match
   * captured. `visitor` supplies the recursion that turns each signature parameter into the call
   * site producing it. Undefined when no signature has every parameter satisfiable.
   */
  export function fromAnswer(serviceType: Type, answer: Answer, visitor: Type.Visitor<CallSite | undefined>): CallSite | undefined {
    const { descriptor: wideDesc, generics } = answer;
    const [kind, descriptor] = ServiceDescriptor.kind(wideDesc);
    switch (kind) {
      case 'ctor': {
        const args = lowerSignature(descriptor.ctorType.args, generics, visitor);
        return args && ctor(descriptor.ctor, args, serviceType, wideDesc);
      }
      case 'factory': {
        const args = lowerSignature(descriptor.factoryType.args, generics, visitor);
        return args && factory(descriptor.factory, args, serviceType, wideDesc);
      }
      case 'value': {
        return constant(descriptor.value);
      }
      default:
        return assertNever(descriptor);
    }
  }

  /** The first parameter row whose every parameter lowers to a call site, longest first. */
  function lowerSignature(signatures: Type.Signatures, generics: ReadonlyMap<string, Type>, visitor: Type.Visitor<CallSite | undefined>): CallSite[] | undefined {
    return Iterator.from(signatures.toSorted((a, b) => b.length - a.length))
      .map(signature => signature.map(parameter => lowerParameter(parameter, generics, visitor)))
      .find(isAllThere);
  }

  /**
   * A parameter that IS a hole receives the type that closed it, since an implementation whose
   * type parameter erased at runtime has nothing else to work from — which is why an instance of
   * the closing type is deliberately not spellable, and a service wanting one takes an
   * `IServiceProvider` beside the type it was handed. A hole standing INSIDE a larger parameter
   * is part of a type expression rather than the whole of one: it closes into that expression,
   * and the result resolves as any other dependency does.
   */
  function lowerParameter(parameter: Type, generics: ReadonlyMap<string, Type>, visitor: Type.Visitor<CallSite | undefined>): CallSite | undefined {
    if (parameter.kind === 'generic') {
      const closing = generics.get(parameter.label);
      return closing && constant(closing);
    }
    return visitor.visit(generics.size ? Type.substitute(parameter, generics) : parameter);
  }

  export const realize = realizeCallSite;
}
