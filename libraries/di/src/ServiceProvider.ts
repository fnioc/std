import { Manifest, RESOLVER_TYPE, ServiceDescriptor, UnsatisfiableError } from '@rhombus-std/di.core';
import { augment, type IServiceProvider, NotImplementedError, type Token, Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Ctor, Func } from '@rhombus-toolkit/func';
import { Engine } from './internal/Engine.js';
import { ServiceProviderOptions } from './ServiceProviderOptions.js';

// The synthetic address a value-driven `getService` call resolves under. Never persisted —
// it exists only for the one `additionalServices` entry that call synthesizes, then discards.
const VALUE_SERVICE_TYPE = Type.named('GetServiceValue', '@rhombus-std/di');

// `ServiceProvider` implements the value-driven `getService` overloads directly below — reaching
// this provider's own resolution engine to realize a caller-supplied `ctor`/`fn` is only possible
// from inside the class. This merge is what lets an `IServiceProvider`-typed caller see them too.
type IServiceProviderValueAugmentations = {
  getService<T>(ctor: new(...args: never[]) => T): T;
  getService<T>(fn: (...args: never[]) => T): T;
};
declare module '@rhombus-std/primitives' {
  interface IServiceProvider extends IServiceProviderValueAugmentations {}
}

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
   * Constructs `ctor` fresh, handing it this provider as its one argument so it can pull
   * whatever it depends on from `getRequiredService`/`getService` itself.
   *
   * @remarks
   * Nothing is registered by this call and nothing it builds is cached — two calls for the same
   * `ctor` never share a result, even for a `ctor` that is separately registered elsewhere.
   */
  getService<T>(ctor: new(...args: never[]) => T): T;
  /**
   * Calls `fn`, handing it this provider as its one argument so it can pull whatever it depends
   * on from `getRequiredService`/`getService` itself.
   *
   * @remarks
   * Nothing is registered by this call and nothing it builds is cached — two calls for the same
   * `fn` never share a result. A `fn` actually written as a `new.target`-guarded constructor is
   * rescued: a `TypeError` naming "constructor" from the call retries once through construction
   * instead. The retry re-executes `fn` — a non-idempotent `fn` that throws that shape of error
   * partway through its body runs twice. The rescue is best-effort, not a contract: an engine is
   * free to word its guard's message however it likes.
   */
  getService<T>(fn: (...args: never[]) => T): T;
  getService(target: Type | Token | Function): any {
    if (typeof target === 'function') {
      return this.#getServiceFromValue(target);
    }
    if (typeof target === 'string') {
      return this.#resolveType(Type.from(target));
    }
    if (typeof target === 'object' && target !== null) {
      return this.#resolveType(target);
    }
    throw new TypeError(
      `getService needs a Type, a token string, a constructor, or a function; got ${
        target === null ? 'null' : typeof target
      }.`,
    );
  }

  #resolveType(type: Type): any {
    try {
      return this.#engine.resolve(type, { serviceProvider: this });
    } catch (error) {
      if (error instanceof UnsatisfiableError && error.type === type) {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * Classifies `value` as construct-only or callable and invokes it with this provider as its
   * one argument, synthesizing a throwaway {@link ServiceDescriptor} and resolving it through
   * the engine's `additionalServices` channel rather than invoking `value` directly — the same
   * door {@link RESOLVER_TYPE} always resolves through, so a caller-supplied `value` is realized
   * exactly like a registered one, just against a manifest composed for this one call and
   * discarded after.
   */
  #getServiceFromValue(value: Function): any {
    if (isConstructOnly(value)) {
      return this.#resolveValue(ServiceDescriptor.ctor(VALUE_SERVICE_TYPE, value as Ctor, [[RESOLVER_TYPE]]));
    }
    try {
      return this.#resolveValue(ServiceDescriptor.factory(VALUE_SERVICE_TYPE, value as Func, [[RESOLVER_TYPE]]));
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('constructor')) {
        return this.#resolveValue(ServiceDescriptor.ctor(VALUE_SERVICE_TYPE, value as Ctor, [[RESOLVER_TYPE]]));
      }
      throw error;
    }
  }

  #resolveValue(descriptor: ServiceDescriptor<string>): any {
    return this.#engine.resolve(VALUE_SERVICE_TYPE, { serviceProvider: this, additionalServices: [descriptor] });
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

/**
 * Class syntax and construct-only natives (a `WeakMap`, a `Proxy`) both refuse to be called
 * without `new`; ordinary functions — including one written as a `new.target`-guarded
 * constructor — don't carry either tell, so they fall through to being called first.
 */
function isConstructOnly(value: Function): boolean {
  if (Function.prototype.toString.call(value).startsWith('class ')) {
    return true;
  }
  const prototype = Object.getOwnPropertyDescriptor(value, 'prototype');
  return prototype !== undefined && prototype.writable === false;
}
