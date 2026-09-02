import { type Addon, type GetService, type IServiceProvider, Manifest, type Middleware, type Registration, UnsatisfiableError } from '@rhombus-std/di.core';
import type { Func } from '@rhombus-toolkit/func';
import { concat, iterable } from '@rhombus-toolkit/obj';
import { Engine } from './internal/Engine.js';
import { ServiceProvider } from './ServiceProvider.js';

/**
 * Assembles a service provider: every genesis input — the lifetime model, every other addon, and
 * any manifest content — arrives through this one surface, and {@link build} seals it into a
 * provider. The builder holds one list; registrations are an addon like any other.
 *
 * @typeParam Lifetime - the lifetime vocabulary every addon on this builder must thread: `unknown`
 * until the first input carrying a vocabulary locks it on, and fixed for the chain from there.
 */
export interface Builder<Lifetime> {
  /**
   * Installs `addon`: its registrations file in call order, and its middleware composes into
   * the same chain alongside every other addon's, at this call's position.
   */
  useAddon<Candidate>(
    addon: Addon<Candidate> & Addon<unknown extends Lifetime ? Candidate : Lifetime> & (0 extends 1 & Candidate ? never : unknown),
  ): Builder<unknown extends Lifetime ? Candidate : Lifetime>;

  /**
   * Installs the registrations `fn` composes onto an empty manifest, as an addon contributing no
   * middleware of its own.
   */
  withServices<Candidate>(
    fn:
      & Func<[Manifest<unknown extends Lifetime ? Candidate : Lifetime>], Iterable<Registration<unknown extends Lifetime ? Candidate : Lifetime>>>
      & (0 extends 1 & Candidate ? never : unknown),
  ): Builder<unknown extends Lifetime ? Candidate : Lifetime>;

  /** Seals the configured manifest into a provider. */
  build(): IServiceProvider;
}

/** The addon `withServices` installs: the registrations `fn` composes, and no middleware of its own. */
function servicesAddon<Lifetime>(fn: Func<[Manifest<Lifetime>], Iterable<Registration<Lifetime>>>): Addon<Lifetime> {
  return { registrations: Manifest.build(fn), middleware: identityMiddleware };
}

/**
 * The one builder. The vocabulary is a compile-time thread the {@link Builder} interface carries;
 * at runtime every addon folds into one manifest, so the class holds none and the openers hand it
 * out under whichever vocabulary their caller locked on.
 */
class DefaultContext implements Builder<any> {
  readonly #addons: Iterable<Addon<any>>;

  constructor(addons: Iterable<Addon<any>> = []) {
    this.#addons = addons;
  }

  useAddon(addon: Addon<any>): Builder<any> {
    return new DefaultContext(iterable(() => concat(this.#addons, addon)));
  }

  withServices(fn: Func<[Manifest<any>], Iterable<Registration<any>>>): Builder<any> {
    return new DefaultContext(iterable(() => concat(this.#addons, servicesAddon(fn))));
  }

  build(): IServiceProvider {
    const addons = Array.from(this.#addons);
    const engine = new Engine(addons.reduce((newer, addon) => concat(addon.registrations, newer), [] as Iterable<Registration<any>>));
    // The engine composes exactly like any other middleware: it answers what its registrations
    // can produce and hands anything unregistered on through `next`.
    const engineMiddleware: Middleware = next => request => engine.getService(request, next);

    const head = addons
      .map(addon => addon.middleware)
      .concat(engineMiddleware)
      .reduceRight(
        (next, middleware) => middleware(next),
        middlewareTermination,
      );
    return new ServiceProvider(head);
  }
}

/** The identity middleware: passes every request through unchanged. */
const identityMiddleware: Middleware = next => next;

/** The chain openers — services or the model may come first, and either fixes the vocabulary. */
export namespace Builder {
  export function useAddon<Lifetime>(addon: Addon<Lifetime> & (0 extends 1 & Lifetime ? never : unknown)): Builder<Lifetime> {
    return new DefaultContext([addon]);
  }

  export function withServices<Lifetime>(
    fn: Func<[Manifest<Lifetime>], Iterable<Registration<Lifetime>>> & (0 extends 1 & Lifetime ? never : unknown),
  ): Builder<Lifetime> {
    return new DefaultContext([servicesAddon(fn)]);
  }
}

const middlewareTermination: GetService = request => {
  throw new UnsatisfiableError(request.type, 'nothing in the manifest produces it');
};
