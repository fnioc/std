import { Manifest, ServiceDescriptor, UnsatisfiableError } from '@rhombus-std/di.core';
import { augment, type ConstructorType, type FunctionType, type IServiceProvider, NotImplementedError, Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Ctor, Func } from '@rhombus-toolkit/func';
import { assertNever } from '@rhombus-toolkit/type-guards';
import { Engine } from './internal/Engine.js';
import { ServiceProviderOptions } from './ServiceProviderOptions.js';

// Merged rather than `implements`: the receiver carries augmented members that the registry
// installs at runtime, which `implements` would demand statically.
export interface ServiceProvider extends IServiceProvider {}

/** The user-facing door: a manifest sealed into a resolvable provider. */
@augment(typefor<IServiceProvider>())
export class ServiceProvider {
  readonly #engine: Engine;

  /** @throws {ManifestValidationError} when `options.validateOnBuild` finds an unsatisfiable graph. */
  constructor(manifest: Manifest<any>, options: ServiceProviderOptions = ServiceProviderOptions.defaults) {
    this.#engine = new Engine(manifest);
    if (options.validateOnBuild) {
      this.#engine.validate();
    }
  }

  /**
   * The value registered for `serviceType`, or `undefined` when nothing is registered for it.
   *
   * @remarks
   * Absence is an answer here, which is what makes this the optional lookup a caller reaches for
   * when a dependency may legitimately not be there. A registration that exists but cannot be
   * built still throws — that is a broken graph, not an absent service.
   */
  getService(): any;
  getService(serviceType: Type): any;
  /**
   * Constructs `ctor` fresh, its dependencies resolved from `ctorType` — `ctor`'s own parameter
   * types, in order.
   *
   * @remarks
   * Nothing here is registered or cached: two calls build two instances, even for a `ctor`
   * separately registered elsewhere under its own address.
   */
  getService<R>(ctorType: ConstructorType, ctor: Ctor<any[], R>): R;
  /**
   * Calls `func`, its dependencies resolved from `funcType` — `func`'s own parameter types, in order.
   *
   * @remarks
   * Nothing here is registered or cached: two calls build two results, even for a `func`
   * separately registered elsewhere under its own address.
   */
  getService<R>(funcType: FunctionType, func: Func<any[], R>): R;
  getService(
    ...args: [] | [serviceType: Type] | [ctorType: ConstructorType, ctor: Ctor] | [funcType: FunctionType, func: Func]
  ): any {
    if (!arguments.length) {
      // The zero-argument row exists only so the class satisfies the augmented type-argument
      // face, which the transform rewrites before it can ever reach this body.
      throw new TypeError('getService needs a service type; the zero-argument form exists only pre-transform.');
    }
    const [serviceType, value] = args;
    if (value !== undefined) {
      return this.#getServiceFromValue(serviceType as ConstructorType | FunctionType, value);
    }
    if (!serviceType) {
      throw new TypeError('getService was handed a nullish service type.');
    }
    try {
      return this.#engine.resolve(serviceType, { serviceProvider: this });
    } catch (error) {
      if (error instanceof UnsatisfiableError && error.type === serviceType) {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * Synthesizes a throwaway {@link ServiceDescriptor} for `value` under the address
   * `callableType` itself, the node standing as its own implementer type, and resolves it
   * through the engine's
   * `additionalServices` channel — so `value` is realized exactly like a registered constructor
   * or factory, just against a manifest composed for this one call and discarded after. The
   * node's own parameter rows are therefore the calls the engine may build it through.
   */
  #getServiceFromValue(callableType: ConstructorType | FunctionType, value: Ctor | Func): any {
    const descriptor = (() => {
      switch (callableType.kind) {
        case 'ctor':
          return ServiceDescriptor.ctor(callableType, value as Ctor, callableType);
        case 'func':
          return ServiceDescriptor.factory(callableType, value as Func, callableType);
        default:
          return assertNever(callableType);
      }
    })();
    return this.#engine.resolve(callableType, { serviceProvider: this, additionalServices: [descriptor] });
  }

  /**
   * @remarks
   * Declared ahead of implementation so callers can compile against it; the lifetime and
   * disposal model this depends on is still undecided.
   * @throws {NotImplementedError} always, until that model is decided.
   */
  tryResolve(_type: Type): any {
    throw new NotImplementedError(`ServiceProvider.tryResolve`);
  }

  /**
   * @remarks
   * Declared ahead of implementation so callers can compile against it; the lifetime and
   * disposal model this depends on is still undecided.
   * @throws {NotImplementedError} always, until that model is decided.
   */
  resolveAsync(_type: Type): Promise<any> {
    throw new NotImplementedError(`ServiceProvider.resolveAsync`);
  }

  /** Disposes every scope opened from this provider, most recently opened first. */
  dispose(): void {
    this.#engine.dispose();
  }

  /** Disposes every scope opened from this provider, most recently opened first. */
  disposeAsync(): Promise<void> {
    return this.#engine.disposeAsync();
  }
}
