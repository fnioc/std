import { Manifest } from '@rhombus-std/di2.core';
import { type IServiceProvider, type Token, Type } from '@rhombus-std/primitives';
import { Engine } from './internal/Engine.js';
import { ServiceProviderOptions } from './ServiceProviderOptions.js';

/** The user-facing door: a manifest sealed into a resolvable provider. */
export class ServiceProvider implements IServiceProvider {
  readonly #engine: Engine;

  /** @throws {ManifestValidationError} when `options.validateOnBuild` finds an unsatisfiable graph. */
  constructor(manifest: Manifest, options: ServiceProviderOptions = ServiceProviderOptions.defaults) {
    this.#engine = new Engine(manifest, options);
    if (options.validateOnBuild) {
      this.#engine.validate();
    }
  }

  resolve(type: Type | Token): any {
    const target = typeof type === 'string' ? Type.from(type) : type;
    return this.#engine.resolve(target, { serviceProvider: this });
  }
}
