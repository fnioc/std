import { type Addon, type AddonInstallation, DefaultManifest, IServiceProvider, type LifetimeModel, Manifest, type Middleware, type Registration } from '@rhombus-std/di.core';
import { concat, iterable, type Type } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';
import { Engine } from './internal/Engine.js';
import { ServiceProvider } from './ServiceProvider.js';

/**
 * Assembles a service provider: every genesis input — the manifest content, the lifetime model,
 * and every other addon — arrives through this one surface, and {@link build} seals it into a
 * provider.
 */
export interface ContainerBuilder<Lifetime> {
  /** Composes registrations onto the manifest; delegates apply in call order, each receiving the previous one's result. */
  configureServices(configure: Func<[Manifest<Lifetime>], Iterable<Registration<Lifetime>>>): ContainerBuilder<Lifetime>;

  /**
   * Files every registration in `manifest`, in its own order, ahead of everything configured so
   * far — the same layering {@link configureServices} gives any other registration stream.
   * @param manifest - iteration order is registration order (newest first), exactly as a
   * {@link Manifest} iterates; this is `Manifest`'s own order-preserving `add` overload, so the
   * argument is a `Manifest` specifically, not any registration stream.
   */
  usingManifest(manifest: Manifest<Lifetime>): ContainerBuilder<Lifetime>;

  /**
   * Installs `addon`: its registrations file in call order, and its own middleware — if it mints
   * one — composes into the same chain {@link use} composes into, at this call's position.
   * `usingLifetimeModel` opens through this same door — a lifetime model is an addon like any
   * other — so its own middleware ends up first, and outermost, simply for being the first call.
   */
  useAddon(addon: Addon): ContainerBuilder<Lifetime>;

  /**
   * Composes request-grain middleware around the engine, alongside whatever an addon's own
   * middleware contributes: one chain, in call order, the first call wrapping outermost.
   */
  use(middleware: Middleware): ContainerBuilder<Lifetime>;

  /** Seals the configured manifest into a provider. */
  build(): IServiceProvider;
}

class DefaultContainerBuilder<Lifetime> implements ContainerBuilder<Lifetime> {
  /** One `configureServices` delegate per call, in call order — the registrations dimension, replayed at build. */
  readonly #manifestSteps: Iterable<Func<[Manifest<Lifetime>], Iterable<Registration<Lifetime>>>>;
  /** One thunk per `useAddon`/`use` call, in call order — the addon dimension, replayed at build; a plain middleware mints a registration-less installation. */
  readonly #steps: Iterable<Func<[], AddonInstallation>>;

  constructor(
    manifestSteps: Iterable<Func<[Manifest<Lifetime>], Iterable<Registration<Lifetime>>>> = [],
    steps: Iterable<Func<[], AddonInstallation>> = [],
  ) {
    this.#manifestSteps = manifestSteps;
    this.#steps = steps;
  }

  configureServices(configure: Func<[Manifest<Lifetime>], Iterable<Registration<Lifetime>>>): ContainerBuilder<Lifetime> {
    return new DefaultContainerBuilder(
      iterable(() => concat(this.#manifestSteps, configure)),
      this.#steps,
    );
  }

  usingManifest(manifest: Manifest<Lifetime>): ContainerBuilder<Lifetime> {
    return this.configureServices(man => man.add(manifest));
  }

  useAddon(addon: Addon): ContainerBuilder<Lifetime> {
    return new DefaultContainerBuilder(
      this.#manifestSteps,
      iterable(() => concat(this.#steps, () => addon.create())),
    );
  }

  use(middleware: Middleware): ContainerBuilder<Lifetime> {
    return new DefaultContainerBuilder(
      this.#manifestSteps,
      iterable(() => concat(this.#steps, () => ({ middleware }))),
    );
  }

  build(): IServiceProvider {
    const installations = Iterator.from(this.#steps).map(step => step()).toArray();
    // An addon files registrations without knowing this container's lifetime vocabulary; reading
    // what they carry is the model's job, at construction. `usingLifetimeModel` is always the
    // first call, so the model's own installation is always first here too — its registrations
    // land at the floor, and every later addon files above it.
    const manifestWithAddons = installations.reduce(
      (manifest, { registrations }) => registrations ? new DefaultManifest<Lifetime>(() => concat(registrations as Iterable<Registration<Lifetime>>, manifest)) : manifest,
      Manifest.empty<Lifetime>(),
    );
    const manifest = Iterator.from(this.#manifestSteps).reduce((manifest, step) => new DefaultManifest(step(manifest)), manifestWithAddons);
    const engine = new Engine(manifest);
    // The chain every resolution runs inside, in call order: the model's own middleware wraps
    // outermost — falling straight out of being the first installation — and each later
    // `useAddon`/`use` call wraps inside the one before it.
    const middlewares = installations.map(({ middleware }) => middleware).filter(middleware => middleware !== undefined);
    const head = middlewares.reduceRight<Func<[request: Type], unknown>>((next, middleware) => middleware(next), address => engine.getService(address));
    return new ServiceProvider(head);
  }
}

/** The entry point: genesis starts by choosing the lifetime model. */
export namespace di {
  /** Opens a {@link ContainerBuilder} whose manifests and provider run on the given lifetime model. */
  export function usingLifetimeModel<Lifetime>(lifetimeModel: LifetimeModel<Lifetime>): ContainerBuilder<Lifetime> {
    return new DefaultContainerBuilder<Lifetime>().useAddon(lifetimeModel);
  }
}
