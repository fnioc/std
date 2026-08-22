import { type LifetimeModel, LifetimeModelError } from '@rhombus-std/di.core';
import type { IServiceProvider } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';
import { assertNever } from '@rhombus-toolkit/type-guards';
import type { Engine } from '../Engine.js';
import type { ArrayCallSite, CallSite, ConstantCallSite, CtorCallSite, FactoryCallSite, IterableCallSite, LateBoundArgCallSite, LateBoundCallSite, RegisteredCtorCallSite, RegisteredFactoryCallSite,
  ServiceProviderCallSite } from './CallSite.js';

export interface RealizeOptions {
  readonly engine: Engine;
  /** What a service asking for the provider receives — the walk's originating facade. */
  readonly serviceProvider: IServiceProvider;
  /** The lifetime model governing the walk's root site. */
  readonly lifetimeModel: LifetimeModel;
  /** A latebound call's arguments, read by position from the {@link LateBoundArgCallSite}s in its plan. */
  readonly args?: readonly unknown[];
}

/**
 * Realizes a {@link CallSite} tree into the value it describes.
 *
 * @remarks
 * One instance per walk — {@link realizeCallSite} is the entry point. `ctor` and `factory`
 * nodes realize their argument sites depth-first; a `latebound` node realizes to a function
 * that re-enters the engine on every call, the call's arguments entering as value
 * registrations; the leaf kinds read the walk-wide {@link RealizeOptions} fixed at
 * construction.
 */
class RealizeVisitor {
  readonly #engine: Engine;
  readonly #serviceProvider: IServiceProvider;
  readonly #lifetimeModel: LifetimeModel;
  readonly #args: readonly unknown[] | undefined;

  constructor({ engine, serviceProvider, lifetimeModel, args }: RealizeOptions) {
    this.#engine = engine;
    this.#serviceProvider = serviceProvider;
    this.#lifetimeModel = lifetimeModel;
    this.#args = args;
  }

  visit(site: CallSite, model: LifetimeModel): any {
    switch (site.kind) {
      case 'registered-ctor':
        return this.visitRegisteredCtor(site, model);
      case 'registered-factory':
        return this.visitRegisteredFactory(site, model);
      case 'ctor':
        return this.visitCtor(site, model);
      case 'factory':
        return this.visitFactory(site, model);
      case 'latebound':
        return this.visitLateBound(site);
      case 'latebound-arg':
        return this.visitLateBoundArg(site);
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

  protected visitRegisteredCtor(site: RegisteredCtorCallSite, model: LifetimeModel): any {
    return this.#realize(site, model, (...args) => new site.ctor(...args));
  }

  protected visitRegisteredFactory(site: RegisteredFactoryCallSite, model: LifetimeModel): any {
    return this.#realize(site, model, site.factory);
  }

  /**
   * Calls the model with the throw attributed: an error raised by the model's own code surfaces
   * as {@link LifetimeModelError} naming the site, while an error `make` raised passes through
   * untouched — the construction, not the model, owns that one.
   */
  #realize(site: RegisteredCtorCallSite | RegisteredFactoryCallSite, model: LifetimeModel, callable: Func): any;
  #realize(site: RegisteredCtorCallSite | RegisteredFactoryCallSite, model: LifetimeModel, callable: Func,
    { serviceType, descriptor }: RegisteredCtorCallSite | RegisteredFactoryCallSite = site): any {
    let madeThrew = false;
    let madeError: unknown;
    try {
      return model.realize({
        site,
        serviceType,
        descriptor,
        make: descendantModel => {
          try {
            return callable(...site.args.map(arg => this.visit(arg, descendantModel)));
          } catch (error) {
            madeThrew = true;
            madeError = error;
            throw error;
          }
        },
      });
    } catch (error) {
      if (madeThrew && error === madeError) {
        throw error;
      }
      throw new LifetimeModelError(site.serviceType, error);
    }
  }

  protected visitCtor(site: CtorCallSite, model: LifetimeModel): any {
    return new site.ctor(...site.args.map(arg => this.visit(arg, model)));
  }

  protected visitFactory(site: FactoryCallSite, model: LifetimeModel): any {
    return site.factory(...site.args.map(arg => this.visit(arg, model)));
  }

  protected visitLateBound(site: LateBoundCallSite): any {
    return (...args: any[]) => this.#engine.resolveLatebound(site.funcType, args, this.#serviceProvider);
  }

  protected visitLateBoundArg(site: LateBoundArgCallSite): any {
    return this.#args![site.index];
  }

  protected visitConstant(site: ConstantCallSite): any {
    return site.value;
  }

  protected visitServiceProvider(_site: ServiceProviderCallSite): any {
    return this.#serviceProvider;
  }

  /**
   * @remarks
   * Re-iterable rather than a one-shot iterator: a caller that walks it twice gets a value both
   * times. Each walk realizes afresh, so a transient member is a new instance per pass.
   */
  protected visitIterable(site: IterableCallSite, model: LifetimeModel): any {
    return { [Symbol.iterator]: () => Iterator.from(site.types).map(inner => this.visit(inner, model)) };
  }

  protected visitArray(site: ArrayCallSite, model: LifetimeModel): any {
    return site.types.map(inner => this.visit(inner, model));
  }
}

/** Realizes {@link callSite} into its value; the walk is synchronous throughout. */
export function realizeCallSite(callSite: CallSite, options: RealizeOptions): any {
  return new RealizeVisitor(options).visit(callSite, options.lifetimeModel);
}
