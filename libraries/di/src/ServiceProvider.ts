import { Manifest, ServiceDescriptor, TypeSignatures, UnsatisfiableError } from '@rhombus-std/di.core';
import { augment, type ConstructorType, type FunctionType, type IServiceProvider, NotImplementedError, type Token,
  Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Ctor, Func } from '@rhombus-toolkit/func';
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
  getService(type: Type | Token): any;
  /**
   * Constructs `ctor` fresh, its dependencies resolved from `type` — `ctor`'s own parameter
   * types, in order.
   *
   * @remarks
   * Nothing here is registered or cached: two calls build two instances, even for a `ctor`
   * separately registered elsewhere under its own address.
   */
  getService<R>(type: ConstructorType, ctor: Ctor<any[], R>): R;
  /**
   * Calls `func`, its dependencies resolved from `type` — `func`'s own parameter types, in order.
   *
   * @remarks
   * Nothing here is registered or cached: two calls build two results, even for a `func`
   * separately registered elsewhere under its own address.
   */
  getService<R>(type: FunctionType, func: Func<any[], R>): R;
  getService(
    ...args: [type: Type | Token] | [type: ConstructorType, ctor: Ctor] | [type: FunctionType, func: Func]
  ): any {
    const [type, value] = args;
    if (value !== undefined) {
      return this.#getServiceFromValue(type as ConstructorType | FunctionType, value);
    }
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

  /**
   * Synthesizes a throwaway {@link ServiceDescriptor} for `value` under the address `type`
   * itself, its signature `type`'s own parameter types, and resolves it through the engine's
   * `additionalServices` channel — so `value` is realized exactly like a registered constructor
   * or factory, just against a manifest composed for this one call and discarded after.
   */
  #getServiceFromValue(type: ConstructorType | FunctionType, value: Ctor | Func): any {
    const signature = TypeSignatures.fromImplType(type);
    const descriptor = type.kind === 'ctor'
      ? ServiceDescriptor.ctor(type, value as Ctor, signature)
      : ServiceDescriptor.factory(type, value as Func, signature);
    return this.#engine.resolve(type, { serviceProvider: this, additionalServices: [descriptor] });
  }

  /**
   * @remarks
   * Declared ahead of implementation so callers can compile against it; the lifetime and
   * disposal model this depends on is still undecided.
   * @throws {NotImplementedError} always, until that model is decided.
   */
  tryResolve(_type: Type | Token): any {
    return notImplemented('tryResolve');
  }

  /**
   * @remarks
   * Declared ahead of implementation so callers can compile against it; the lifetime and
   * disposal model this depends on is still undecided.
   * @throws {NotImplementedError} always, until that model is decided.
   */
  resolveAsync(_type: Type | Token): Promise<any> {
    return notImplemented('resolveAsync');
  }

  /**
   * @remarks
   * Declared ahead of implementation so callers can compile against it; the disposal model this
   * depends on is still undecided.
   * @throws {NotImplementedError} always, until that model is decided.
   */
  dispose(): void {
    return notImplemented('dispose');
  }

  /**
   * @remarks
   * Declared ahead of implementation so callers can compile against it; the disposal model this
   * depends on is still undecided.
   * @throws {NotImplementedError} always, until that model is decided.
   */
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
