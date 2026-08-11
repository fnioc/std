import { Manifest } from '@rhombus-std/di2.core';
import { type IServiceProvider, type Token, Type } from '@rhombus-std/primitives';
import { Engine } from './internal/Engine.js';
import { ServiceProviderOptions } from './ServiceProviderOptions.js';

// Merged rather than `implements`: the receiver carries augmented members that the registry
// installs at runtime, which `implements` would demand statically.
export interface ServiceProvider extends IServiceProvider {}

/** The user-facing door: a manifest sealed into a resolvable provider. */
export class ServiceProvider {
  readonly #engine: Engine;

  /** @throws {ManifestValidationError} when `options.validateOnBuild` finds an unsatisfiable graph. */
  constructor(manifest: Manifest, options: ServiceProviderOptions = ServiceProviderOptions.defaults) {
    this.#engine = new Engine(manifest, options);
    if (options.validateOnBuild) {
      this.#engine.validate();
    }
  }

  getService(type: Type | Token): any {
    const target = typeof type === 'string' ? Type.from(type) : type;
    return this.#engine.resolve(target, { serviceProvider: this });
  }

  /** @throws always — see {@link notImplemented}. */
  tryResolve(_type: Type | Token): any {
    return notImplemented('tryResolve');
  }

  /** @throws always — see {@link notImplemented}. */
  resolveAsync(_type: Type | Token): Promise<any> {
    return notImplemented('resolveAsync');
  }

  /** @throws always — see {@link notImplemented}. */
  dispose(): void {
    return notImplemented('dispose');
  }

  /** @throws always — see {@link notImplemented}. */
  disposeAsync(): Promise<void> {
    return notImplemented('disposeAsync');
  }
}

/**
 * Stands in for a member that is declared so callers can be written against it, but has no
 * behaviour yet. Reaching one is a fault in the caller's expectations, not a resolution failure,
 * so it is a plain error rather than anything the container taxonomy would invite you to catch.
 */
function notImplemented(member: string): never {
  throw new Error(`ServiceProvider.${member} is not implemented.`);
}
