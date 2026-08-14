import { ServiceDescriptor } from '@rhombus-std/di.core';
import type { IServiceProvider } from '@rhombus-std/primitives';
import { assertNever } from '@rhombus-toolkit/type-guards';
import type { Engine } from '../Engine.js';
import type { ArrayCallSite, CallSite, ConstantCallSite, CtorCallSite, FactoryCallSite, IterableCallSite,
  LateBoundCallSite, ServiceProviderCallSite } from './CallSite.js';

export interface RealizeContext {
  readonly engine: Engine;
  /** What a service asking for the provider receives — the walk's originating facade. */
  readonly serviceProvider: IServiceProvider;
}

/**
 * Realizes a {@link CallSite} tree into the value it describes.
 *
 * @remarks
 * One instance per walk — {@link realizeCallSite} is the entry point. `ctor` and `factory`
 * nodes realize their argument sites depth-first; a `latebound` node realizes to a function
 * that re-enters the engine on every call, the call's arguments entering as value
 * registrations; the leaf kinds read the walk-wide {@link RealizeContext} fixed at
 * construction.
 */
class RealizeVisitor {
  readonly #context: RealizeContext;

  constructor(context: RealizeContext) {
    this.#context = context;
  }

  visit(site: CallSite): any {
    switch (site.kind) {
      case 'ctor':
        return this.visitCtor(site);
      case 'factory':
        return this.visitFactory(site);
      case 'latebound':
        return this.visitLateBound(site);
      case 'constant':
        return this.visitConstant(site);
      case 'service-provider':
        return this.visitServiceProvider(site);
      case 'iterable':
        return this.visitIterable(site);
      case 'array':
        return this.visitArray(site);
      default:
        return assertNever(site);
    }
  }

  protected visitCtor(site: CtorCallSite): any {
    return new site.ctor(...site.args.map(arg => this.visit(arg)));
  }

  protected visitFactory(site: FactoryCallSite): any {
    return site.factory(...site.args.map(arg => this.visit(arg)));
  }

  protected visitLateBound(site: LateBoundCallSite): any {
    const context = this.#context;
    return (...args: any[]) => {
      const bound = site.lateBoundArgs.find(row => row.length === args.length) ?? site.lateBoundArgs[0] ?? [];
      return context.engine.resolve(site.result, {
        serviceProvider: context.serviceProvider,
        additionalServices: bound.map((serviceType, i) => ServiceDescriptor.value(serviceType, args[i])),
      });
    };
  }

  protected visitConstant(site: ConstantCallSite): any {
    return site.value;
  }

  protected visitServiceProvider(_site: ServiceProviderCallSite): any {
    return this.#context.serviceProvider;
  }

  /**
   * @remarks
   * Re-iterable rather than a one-shot iterator: a caller that walks it twice gets a value both
   * times. Each walk realizes afresh, so a transient member is a new instance per pass.
   */
  protected visitIterable(site: IterableCallSite): any {
    const realize = (inner: CallSite) => this.visit(inner);
    return {
      *[Symbol.iterator]() {
        for (const inner of site.types) {
          yield realize(inner);
        }
      },
    };
  }

  protected visitArray(site: ArrayCallSite): any {
    return site.types.map(inner => this.visit(inner));
  }
}

/** Realizes {@link callSite} into its value; the walk is synchronous throughout. */
export function realizeCallSite(callSite: CallSite, context: RealizeContext): any {
  return new RealizeVisitor(context).visit(callSite);
}
