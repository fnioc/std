import type { ServiceDescriptor } from '@rhombus-std/di.core';
import { isAllThere } from '@rhombus-std/primitives';
import type { Type, TypeVisitor } from '@rhombus-std/primitives';
import { Ctor, Func } from '@rhombus-toolkit/func';
import { assertNever } from '@rhombus-toolkit/type-guards';
import { realizeCallSite } from './RealizeVisitor.js';
import { type CallSiteContext, ToCallSiteVisitor } from './ToCallSiteVisitor.js';

export type { RealizeContext } from './RealizeVisitor.js';

export type CallSite =
  | CtorCallSite
  | FactoryCallSite
  | LateBoundCallSite
  | ConstantCallSite
  | ServiceProviderCallSite
  | IterableCallSite
  | ArrayCallSite;

export interface CtorCallSite {
  readonly kind: 'ctor';
  readonly ctor: Ctor;
  readonly args: CallSite[];
}
/** A registered factory the engine invokes — {@link args} realize its parameters. */
export interface FactoryCallSite {
  readonly kind: 'factory';
  readonly factory: Func;
  readonly args: CallSite[];
}
/**
 * A function value handed back to the caller; each invocation re-enters the engine to resolve
 * {@link result}, the call's arguments registered as values for {@link lateBoundArgs}, in order.
 */
export interface LateBoundCallSite {
  readonly kind: 'latebound';
  readonly result: Type;
  readonly lateBoundArgs: readonly Type[];
}
export interface ConstantCallSite {
  readonly kind: 'constant';
  readonly value: any;
}
export interface ServiceProviderCallSite {
  readonly kind: 'service-provider';
}
/**
 * Every registration serving one type, realized lazily and re-iterably: each walk constructs
 * afresh, so a transient member yields a new instance per pass.
 */
export interface IterableCallSite {
  readonly kind: 'iterable';
  readonly types: readonly CallSite[];
}
/** The same members as {@link IterableCallSite}, realized eagerly into a fresh array per request. */
export interface ArrayCallSite {
  readonly kind: 'array';
  readonly types: readonly CallSite[];
}

export namespace CallSite {
  export function ctor(ctor: Ctor, args: CallSite[]): CtorCallSite {
    return { kind: 'ctor', ctor, args };
  }
  export function factory(factory: Func, args: CallSite[]): FactoryCallSite {
    return { kind: 'factory', factory, args };
  }
  export function latebound(result: Type, lateBoundArgs: readonly Type[]): LateBoundCallSite {
    return { kind: 'latebound', result, lateBoundArgs };
  }
  export function constant(value: any): ConstantCallSite {
    return { kind: 'constant', value };
  }
  export function serviceProvider(): ServiceProviderCallSite {
    return { kind: 'service-provider' };
  }
  export function iterable(types: readonly CallSite[]): IterableCallSite {
    return { kind: 'iterable', types };
  }
  export function array(types: readonly CallSite[]): ArrayCallSite {
    return { kind: 'array', types };
  }

  export function from(type: Type, context: CallSiteContext): CallSite | undefined {
    return new ToCallSiteVisitor(context).visit(type);
  }

  /**
   * Lowers an ALREADY-CLOSED descriptor — run it through {@link ServiceDescriptor.substitute}
   * first if the match captured placeholders. `visitor` supplies the recursion that turns each
   * signature parameter into the call site producing it. Undefined when no signature has every
   * parameter satisfiable.
   */
  export function fromDescriptor(descriptor: ServiceDescriptor<string>, visitor: TypeVisitor<CallSite | undefined>):
    | CallSite
    | undefined {
    switch (descriptor.kind) {
      case 'value':
        return constant(descriptor.value);
      case 'ctor': {
        const args = lowerSignature(descriptor.signatures, visitor);
        return args && ctor(descriptor.ctor, args);
      }
      case 'factory': {
        const args = lowerSignature(descriptor.signatures, visitor);
        return args && factory(descriptor.factory, args);
      }
      default:
        return assertNever(descriptor);
    }
  }

  /** The first signature whose every parameter lowers to a call site, longest first. */
  function lowerSignature(signatures: ReadonlyArray<readonly Type[]>, visitor: TypeVisitor<CallSite | undefined>):
    | CallSite[]
    | undefined {
    return Iterator.from(signatures.toSorted((a, b) => b.length - a.length))
      .map(signature => signature.map(param => visitor.visit(param)))
      .find(isAllThere);
  }

  export const realize = realizeCallSite;
}
