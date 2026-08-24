import { type IServiceProvider, LifetimeModelError, type Realizer, ServiceDescriptor } from '@rhombus-std/di.core';
import type { Ctor, Func } from '@rhombus-toolkit/func';
import { assertNever } from '@rhombus-toolkit/type-guards';
import type { Engine } from '../Engine.js';
import type { ArrayCallSite, CallSite, ConstantCallSite, CtorCallSite, FactoryCallSite, InvokerCallSite, IterableCallSite, LateBoundArgCallSite, LateBoundCallSite, RegisteredCtorCallSite,
  RegisteredFactoryCallSite, ScopeFactoryCallSite, ServiceProviderCallSite } from './CallSite.js';

export interface RealizeOptions {
  readonly engine: Engine;
  /** What a service asking for the provider receives — the walk's originating facade. */
  readonly serviceProvider: IServiceProvider;
  /** The realizer governing the walk's root site. */
  readonly realizer: Realizer;
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
  readonly #args: readonly unknown[] | undefined;

  constructor({ engine, serviceProvider, args }: Omit<RealizeOptions, 'realizer'>) {
    this.#engine = engine;
    this.#serviceProvider = serviceProvider;
    this.#args = args;
  }

  visit(site: CallSite, realizer: Realizer): any {
    switch (site.kind) {
      case 'registered-ctor':
        return this.visitRegisteredCtor(site, realizer);
      case 'registered-factory':
        return this.visitRegisteredFactory(site, realizer);
      case 'ctor':
        return this.visitCtor(site, realizer);
      case 'factory':
        return this.visitFactory(site, realizer);
      case 'latebound':
        return this.visitLateBound(site);
      case 'latebound-arg':
        return this.visitLateBoundArg(site);
      case 'invoker':
        return this.visitInvoker(site);
      case 'constant':
        return this.visitConstant(site);
      case 'service-provider':
        return this.visitServiceProvider(site);
      case 'scope-factory':
        return this.visitScopeFactory(site);
      case 'iterable':
        return this.visitIterable(site, realizer);
      case 'array':
        return this.visitArray(site, realizer);
      default:
        return assertNever(site);
    }
  }

  protected visitRegisteredCtor(site: RegisteredCtorCallSite, realizer: Realizer): any {
    return this.#realize(site, realizer, (...args) => new site.ctor(...args));
  }

  protected visitRegisteredFactory(site: RegisteredFactoryCallSite, realizer: Realizer): any {
    return this.#realize(site, realizer, site.factory);
  }

  /**
   * Calls the realizer with the throw attributed: an error raised by the realizer's own code
   * surfaces as {@link LifetimeModelError} naming the site, while an error `make` raised passes
   * through untouched — the construction, not the realizer, owns that one.
   */
  #realize(site: RegisteredCtorCallSite | RegisteredFactoryCallSite, realizer: Realizer, callable: Func): any;
  #realize(site: RegisteredCtorCallSite | RegisteredFactoryCallSite, realizer: Realizer, callable: Func, { serviceType, descriptor }: RegisteredCtorCallSite | RegisteredFactoryCallSite = site): any {
    let madeThrew = false;
    let madeError: unknown;
    try {
      return realizer.realize({
        site,
        serviceType,
        descriptor,
        make: descendantRealizer => {
          try {
            return callable(...site.args.map(arg => this.visit(arg, descendantRealizer)));
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

  protected visitCtor(site: CtorCallSite, realizer: Realizer): any {
    return new site.ctor(...site.args.map(arg => this.visit(arg, realizer)));
  }

  protected visitFactory(site: FactoryCallSite, realizer: Realizer): any {
    return site.factory(...site.args.map(arg => this.visit(arg, realizer)));
  }

  protected visitLateBound(site: LateBoundCallSite): any {
    return (...args: any[]) => this.#engine.resolveLatebound(site.funcType, args, this.#serviceProvider);
  }

  protected visitLateBoundArg(site: LateBoundArgCallSite): any {
    return this.#args![site.index];
  }

  /**
   * The closure `resolve(callableType, callable)` hands back: each call synthesizes a throwaway
   * descriptor for the caller's own `callable`, under `callableType` itself as the address, and
   * hands it to the engine as an invocation frame — nothing here is registered or cached.
   */
  protected visitInvoker(site: InvokerCallSite): any {
    const { callableType } = site;
    return (callable: Ctor | Func) => {
      const descriptor = (() => {
        switch (callableType.kind) {
          case 'ctor':
            return ServiceDescriptor.ctor(callableType, callable as Ctor, callableType);
          case 'func':
            return ServiceDescriptor.factory(callableType, callable as Func, callableType);
          default:
            return assertNever(callableType);
        }
      })();
      return this.#engine.resolveFrame(descriptor, this.#serviceProvider);
    };
  }

  protected visitConstant(site: ConstantCallSite): any {
    return site.value;
  }

  protected visitServiceProvider(_site: ServiceProviderCallSite): any {
    return this.#serviceProvider;
  }

  /** Binds the container's scope factory to the walk's own provider, so a scope it opens defers there. */
  protected visitScopeFactory(_site: ScopeFactoryCallSite): any {
    return this.#engine.scopeFactory(this.#serviceProvider);
  }

  /**
   * @remarks
   * Re-iterable rather than a one-shot iterator: a caller that walks it twice gets a value both
   * times. Each walk realizes afresh, so a transient member is a new instance per pass.
   */
  protected visitIterable(site: IterableCallSite, realizer: Realizer): any {
    return { [Symbol.iterator]: () => Iterator.from(site.types).map(inner => this.visit(inner, realizer)) };
  }

  protected visitArray(site: ArrayCallSite, realizer: Realizer): any {
    return site.types.map(inner => this.visit(inner, realizer));
  }
}

/** Realizes {@link callSite} into its value; the walk is synchronous throughout. */
export function realizeCallSite(callSite: CallSite, options: RealizeOptions): any {
  return new RealizeVisitor(options).visit(callSite, options.realizer);
}
