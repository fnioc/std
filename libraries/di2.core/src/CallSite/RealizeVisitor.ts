import { assertNever } from '@rhombus-toolkit/type-guards';
import type { IServiceProvider } from '../IServiceProvider.js';
import { ServiceDescriptor } from '../ServiceDescriptor.js';
import type { AdHocCallSite, CallSite, ConstantCallSite, CtorCallSite, FactoryCallSite, IterableCallSite,
  LateBoundCallSite, ServiceProviderCallSite } from './CallSite.js';

export interface RealizeContext {
  readonly serviceProvider: IServiceProvider;
  /** Caller-supplied values filling the {@link AdHocCallSite} holes, keyed by label. */
  readonly adhoc?: ReadonlyMap<string, any>;
  /** Values awaited ahead of this synchronous walk, keyed by label. */
  readonly promised?: ReadonlyMap<string, any>;

  readonly additionalServices?: Iterable<ServiceDescriptor<string>>;
}

/**
 * Realizes a {@link CallSite} tree into the value it describes.
 *
 * @remarks
 * One instance per walk — {@link realizeCallSite} is the entry point. `ctor` and `factory`
 * nodes realize their argument sites depth-first; a `latebound` node realizes to a function
 * that re-realizes its inner site on every call, the call's arguments filling its ad-hoc
 * holes; the leaf kinds read the walk-wide {@link RealizeContext} fixed at construction.
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
      case 'adhoc':
        return this.visitAdHoc(site);
      case 'service-provider':
        return this.visitServiceProvider(site);
      case 'iterable':
        return this.visitIterable(site);
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
    return (...args: any[]) => {
      return this.#serviceProvider.resolve(site.result, {
        additionalServices: site.lateBoundArgs.map((serviceType, i) =>
          ServiceDescriptor.make.value(serviceType, args[i])
        ),
      });
    };
  }

  protected visitConstant(site: ConstantCallSite): any {
    return site.value;
  }

  protected visitAdHoc(site: AdHocCallSite): any {
    if (!this.#context.adhoc?.has(site.label)) {
      throw new Error(`no ad-hoc value supplied for '${site.label}'`);
    }
    return this.#context.adhoc.get(site.label);
  }

  protected visitServiceProvider(_site: ServiceProviderCallSite): any {
    return this.#context.serviceProvider;
  }

  protected visitIterable(site: IterableCallSite): any {
    return Iterator.from(site.types).map(type => this.visit(type));
  }
}

/** Realizes {@link callSite} into its value; the walk is synchronous throughout. */
export function realizeCallSite(callSite: CallSite, context: RealizeContext): any {
  return new RealizeVisitor(context).visit(callSite);
}
