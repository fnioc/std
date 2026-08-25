import { type IServiceProvider, Manifest, type Realizer, type ScopeFactory } from '@rhombus-std/di.core';
import { augment, Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';
import { Engine } from './internal/Engine.js';
import { ServiceProviderOptions } from './ServiceProviderOptions.js';

export interface ServiceProvider extends IServiceProvider {}

/** The user-facing door: a manifest sealed into a resolvable provider. */
@augment(typefor<IServiceProvider>())
export class ServiceProvider implements IServiceProvider {
  readonly #engine: Engine;

  /** @throws {ManifestValidationError} when `options.validateOnBuild` finds an unsatisfiable graph. */
  constructor(
    realizer: Realizer,
    scopeFactory: Func<[IServiceProvider], ScopeFactory<readonly any[]>> | undefined,
    manifest: Manifest<unknown>,
    options: ServiceProviderOptions = ServiceProviderOptions.defaults,
  ) {
    this.#engine = new Engine(realizer, scopeFactory, manifest);
    if (options.validateOnBuild) {
      this.#engine.validate();
    }
  }

  getService(serviceType: Type): any {
    if (!serviceType) {
      throw new TypeError('getService was handed a nullish service type.');
    }
    return this.#engine.resolve(serviceType, { serviceProvider: this });
  }
}
