import { type Addon, DefaultManifest, type IServiceProvider, Manifest, type Middleware, type Registration, type Request } from '@rhombus-std/di.core';
import type { Func } from '@rhombus-toolkit/func';
import { concat, iterable } from '@rhombus-toolkit/obj';
import { Engine } from './internal/Engine.js';
import { ServiceProvider } from './ServiceProvider.js';

/**
 * Assembles a service provider: every genesis input — the lifetime model, every other addon, and
 * any manifest content — arrives through this one surface, and {@link build} seals it into a
 * provider. The builder holds one list; registrations are an addon like any other.
 *
 * @typeParam Lifetime - the lifetime vocabulary every addon on this builder must thread.
 */
export interface Builder<Lifetime> {
  /**
   * Installs `addon`: its registrations file in call order, and its middleware composes into
   * the same chain alongside every other addon's, at this call's position.
   */
  useAddon(addon: Addon<Lifetime>): Builder<Lifetime>;

  /**
   * Composes registrations onto the manifest through `fn`, which receives the manifest accumulated
   * from every prior addon and answers the registrations to add.
   */
  withServices(fn: Func<[Manifest<Lifetime>], Iterable<Registration<Lifetime>>>): Builder<Lifetime>;

  /** Seals the configured manifest into a provider. */
  build(): IServiceProvider;
}

/**
 * One step the builder replays at build time. Receives the manifest accumulated so far and
 * answers its registrations and its middleware.
 */
type BuildStep<Lifetime> = Func<[Manifest<Lifetime>], { registrations: Iterable<Registration<Lifetime>>; middleware: Middleware; }>;

class DefaultBuilder<Lifetime> implements Builder<Lifetime> {
  readonly #steps: Iterable<BuildStep<Lifetime>>;

  constructor(steps: Iterable<BuildStep<Lifetime>> = []) {
    this.#steps = steps;
  }

  useAddon(addon: Addon<Lifetime>): Builder<Lifetime> {
    return new DefaultBuilder(
      iterable(() => concat(this.#steps, () => ({ registrations: addon.registrations, middleware: addon.middleware }))),
    );
  }

  withServices(fn: Func<[Manifest<Lifetime>], Iterable<Registration<Lifetime>>>): Builder<Lifetime> {
    return new DefaultBuilder(
      iterable(() => concat(this.#steps, (manifest: Manifest<Lifetime>) => ({ registrations: fn(manifest), middleware: identityMiddleware }))),
    );
  }

  build(): IServiceProvider {
    let manifest = Manifest.empty<Lifetime>();
    const middlewares: Middleware[] = [];

    for (const step of this.#steps) {
      const { registrations, middleware } = step(manifest);
      const materialized = Iterator.from(registrations as Iterable<Registration<Lifetime>>).toArray();
      const tail = manifest;
      manifest = new DefaultManifest<Lifetime>(() => concat(materialized, tail));
      middlewares.push(middleware);
    }

    const engine = new Engine(manifest);
    // The engine is the innermost middleware element, composed exactly like anything else.
    const engineMiddleware: Middleware = _next => request => engine.getService(request);
    middlewares.push(engineMiddleware);

    const head = middlewares.reduceRight<Func<[request: Request], unknown>>(
      (next, middleware) => middleware(next),
      _request => {
        throw new Error('resolution reached past the engine — the chain has no terminus');
      },
    );
    return new ServiceProvider(head);
  }
}

/** The identity middleware: passes every request through unchanged. */
const identityMiddleware: Middleware = next => next;

/** The lock-on: infers `Lifetime` from whichever addon opens the chain. */
export namespace Builder {
  export function useAddon<Lifetime>(addon: Addon<Lifetime>): Builder<Lifetime> {
    return new DefaultBuilder<Lifetime>().useAddon(addon);
  }
}
