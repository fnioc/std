import { type LifetimeModel, LifetimeModelError, ServiceDescriptor } from '@rhombus-std/di.core';
import type { IServiceProvider } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';
import { assertNever } from '@rhombus-toolkit/type-guards';
import type { Engine } from '../Engine.js';
import type { ArrayCallSite, CallSite, ConstantCallSite, CtorCallSite, FactoryCallSite, IterableCallSite, LateBoundCallSite, ServiceProviderCallSite } from './CallSite.js';

export interface RealizeContext {
  readonly engine: Engine;
  /** What a service asking for the provider receives — the walk's originating facade. */
  readonly serviceProvider: IServiceProvider;
  /** The lifetime model governing the walk's root site. */
  readonly lifetimeModel: LifetimeModel;
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

  visit(site: CallSite, model: LifetimeModel): any {
    switch (site.kind) {
      case 'ctor':
        return this.visitCtor(site, model);
      case 'factory':
        return this.visitFactory(site, model);
      case 'latebound':
        return this.visitLateBound(site);
      case 'constant':
        return this.visitConstant(site);
      case 'service-provider':
        return this.visitServiceProvider(site);
      case 'iterable':
        return this.visitIterable(site, model);
      case 'array':
        return this.visitArray(site, model);
      default:
        return assertNever(site);
    }
  }

  protected visitCtor(site: CtorCallSite, model: LifetimeModel): any {
    return this.#realize(site, model, descendantModel => new site.ctor(...site.args.map(arg => this.visit(arg, descendantModel))));
  }

  protected visitFactory(site: FactoryCallSite, model: LifetimeModel): any {
    return this.#realize(site, model, descendantModel => site.factory(...site.args.map(arg => this.visit(arg, descendantModel))));
  }

  /**
   * Calls the model with the throw attributed: an error raised by the model's own code surfaces
   * as {@link LifetimeModelError} naming the site, while an error `make` raised passes through
   * untouched — the construction, not the model, owns that one.
   */
  #realize(site: CtorCallSite | FactoryCallSite, model: LifetimeModel, make: Func<[LifetimeModel], unknown>): any {
    let madeThrew = false;
    let madeError: unknown;
    const attributedMake = (descendantModel: LifetimeModel) => {
      try {
        return make(descendantModel);
      } catch (error) {
        madeThrew = true;
        madeError = error;
        throw error;
      }
    };
    try {
      return model.realize(site, site.serviceType, site.descriptor, attributedMake);
    } catch (error) {
      if (madeThrew && error === madeError) {
        throw error;
      }
      throw new LifetimeModelError(site.serviceType, error);
    }
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
  protected visitIterable(site: IterableCallSite, model: LifetimeModel): any {
    const realize = (inner: CallSite) => this.visit(inner, model);
    return {
      *[Symbol.iterator]() {
        for (const inner of site.types) {
          yield realize(inner);
        }
      },
    };
  }

  protected visitArray(site: ArrayCallSite, model: LifetimeModel): any {
    return site.types.map(inner => this.visit(inner, model));
  }
}

/** Realizes {@link callSite} into its value; the walk is synchronous throughout. */
export function realizeCallSite(callSite: CallSite, context: RealizeContext): any {
  return new RealizeVisitor(context).visit(callSite, context.lifetimeModel);
}
