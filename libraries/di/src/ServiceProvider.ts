import { type IServiceProvider, type Realizer, type Registration } from '@rhombus-std/di.core';
import { augment, Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
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
    registrations: Iterable<Registration<unknown>>,
    options: ServiceProviderOptions = ServiceProviderOptions.defaults,
  ) {
    this.#engine = new Engine(realizer, registrations);
    if (options.validateOnBuild) {
      this.#engine.validate();
    }
  }

  getService(address: Type): any {
    if (!address) {
      throw new TypeError('getService was handed a nullish service type.');
    }
    return this.#engine.resolve(address, { serviceProvider: this });
  }
}
