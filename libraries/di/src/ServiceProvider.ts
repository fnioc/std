import { Manifest, UnsatisfiableError } from '@rhombus-std/di.core';
import { augment, type IServiceProvider, NotImplementedError, Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
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
  constructor(manifest: Manifest<unknown>, options: ServiceProviderOptions = ServiceProviderOptions.defaults) {
    this.#engine = new Engine(manifest.lifetimeModel, manifest);
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
  getService(serviceType: Type): any {
    if (!serviceType) {
      throw new TypeError('getService was handed a nullish service type.');
    }
    try {
      return this.#engine.resolve(serviceType, { serviceProvider: this });
    } catch (error) {
      if (error instanceof UnsatisfiableError && error.serviceType === serviceType) {
        return undefined;
      }
      throw error;
    }
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

  /**
   * @remarks
   * Declared ahead of implementation so callers can compile against it; the lifetime and
   * disposal model this depends on is still undecided.
   * @throws {NotImplementedError} always, until that model is decided.
   */
  dispose(): void {
    throw new NotImplementedError(`ServiceProvider.dispose`);
  }

  /**
   * @remarks
   * Declared ahead of implementation so callers can compile against it; the lifetime and
   * disposal model this depends on is still undecided.
   * @throws {NotImplementedError} always, until that model is decided.
   */
  disposeAsync(): Promise<void> {
    throw new NotImplementedError(`ServiceProvider.disposeAsync`);
  }
}
