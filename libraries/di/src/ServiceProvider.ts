import { Manifest, UnsatisfiableError } from '@rhombus-std/di.core';
import { augment, type IServiceProvider, NotImplementedError, type Token, Type } from '@rhombus-std/primitives';
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
  constructor(manifest: Manifest, options: ServiceProviderOptions = ServiceProviderOptions.defaults) {
    this.#engine = new Engine(manifest, options);
    if (options.validateOnBuild) {
      this.#engine.validate();
    }
  }

  /**
   * The value registered for `type`, or `undefined` when nothing is registered for it.
   *
   * @remarks
   * Absence is an answer here, which is what makes this the optional lookup a caller reaches for
   * when a dependency may legitimately not be there. A registration that exists but cannot be
   * built still throws — that is a broken graph, not an absent service.
   */
  getService(type: Type | Token): any {
    const target = typeof type === 'string' ? Type.from(type) : type;
    try {
      return this.#engine.resolve(target, { serviceProvider: this });
    } catch (error) {
      if (error instanceof UnsatisfiableError && error.type === target) {
        return undefined;
      }
      throw error;
    }
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
  throw new NotImplementedError(`ServiceProvider.${member}`);
}
