import { type AddonInstallation, type ChainAddon, DefaultManifest, IServiceProvider, type LifetimeModel, Manifest, type Middleware, type Registration } from '@rhombus-std/di.core';
import { concat, iterable } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';
import { Engine } from './internal/Engine.js';
import { MiddlewareServiceProvider } from './internal/MiddlewareServiceProvider.js';
import { ServiceProvider } from './ServiceProvider.js';

/**
 * Assembles a service provider: every genesis input — the manifest content and the addons beside
 * the lifetime model — arrives through this one surface, and {@link build} seals them into a
 * provider.
 */
export interface ContainerBuilder<Lifetime> {
  /** Composes registrations onto the manifest; delegates apply in call order, each receiving the previous one's result. */
  configureServices(configure: Func<[Manifest<Lifetime>], Iterable<Registration<Lifetime>>>): ContainerBuilder<Lifetime>;

  /**
   * Seeds the manifest from an existing registration stream, discarding anything configured before
   * this call — the registration stream layers over the model floor, never replacing it.
   * @param manifest - iteration order is registration order (newest first), exactly as a
   * {@link Manifest} iterates.
   */
  usingManifest(manifest: Iterable<Registration<Lifetime>>): ContainerBuilder<Lifetime>;

  /**
   * Installs `addon` beside the lifetime model: its registrations file in call order, and its own
   * middleware — if it mints one — composes into the same chain {@link use} composes into, at this
   * call's position.
   */
  useAddon(addon: ChainAddon): ContainerBuilder<Lifetime>;

  /**
   * Composes request-grain middleware around the engine, alongside whatever an addon's own
   * middleware contributes: one chain, in call order, the first call wrapping outermost.
   */
  use(middleware: Middleware): ContainerBuilder<Lifetime>;

  /** Seals the configured manifest into a provider. */
  build(): IServiceProvider;
}

class DefaultContainerBuilder<Lifetime> implements ContainerBuilder<Lifetime> {
  readonly #lifetimeModel: LifetimeModel<Lifetime>;
  readonly #manifestSteps: Iterable<Func<[Manifest<Lifetime>], Iterable<Registration<Lifetime>>>>;
  /** One thunk per `useAddon`/`use` call, in call order — a plain middleware mints a registration-less installation. */
  readonly #steps: Iterable<Func<[], AddonInstallation>>;

  constructor(
    lifetimeModel: LifetimeModel<Lifetime>,
    manifestSteps: Iterable<Func<[Manifest<Lifetime>], Iterable<Registration<Lifetime>>>>,
    steps: Iterable<Func<[], AddonInstallation>>,
  ) {
    this.#lifetimeModel = lifetimeModel;
    this.#manifestSteps = manifestSteps;
    this.#steps = steps;
  }

  configureServices(configure: Func<[Manifest<Lifetime>], Iterable<Registration<Lifetime>>>): ContainerBuilder<Lifetime> {
    return new DefaultContainerBuilder(
      this.#lifetimeModel,
      iterable(() => concat(this.#manifestSteps, configure)),
      this.#steps,
    );
  }

  usingManifest(manifest: Iterable<Registration<Lifetime>>): ContainerBuilder<Lifetime> {
    return new DefaultContainerBuilder(
      this.#lifetimeModel,
      [floor => new DefaultManifest<Lifetime>(() => concat(manifest, floor))],
      this.#steps,
    );
  }

  useAddon(addon: ChainAddon): ContainerBuilder<Lifetime> {
    return new DefaultContainerBuilder(
      this.#lifetimeModel,
      this.#manifestSteps,
      iterable(() => concat(this.#steps, () => addon.create())),
    );
  }

  use(middleware: Middleware): ContainerBuilder<Lifetime> {
    return new DefaultContainerBuilder(
      this.#lifetimeModel,
      this.#manifestSteps,
      iterable(() => concat(this.#steps, () => ({ middleware }))),
    );
  }

  build(): IServiceProvider {
    const { attach: modelAttach, scopeFactory } = this.#lifetimeModel.create();
    const installations = Iterator.from(this.#steps).map(step => step()).toArray();
    const floor = scopeFactory ? Manifest.empty<Lifetime>().add(scopeFactory) : Manifest.empty<Lifetime>();
    // An addon files registrations without knowing this container's lifetime vocabulary; reading
    // what they carry is the model's job, at construction.
    const manifestWithAddons = installations.reduce(
      (manifest, { registrations }) => registrations ? new DefaultManifest<Lifetime>(() => concat(registrations as Iterable<Registration<Lifetime>>, manifest)) : manifest,
      floor,
    );
    const manifest = Iterator.from(this.#manifestSteps).reduce((manifest, step) => new DefaultManifest(step(manifest)), manifestWithAddons);
    const engine = new Engine(manifest);
    // The chain every resolution runs inside, in call order: the first `useAddon`/`use` call wraps
    // outermost, so everything a request brings with it — a scope's keeping included — sits within.
    const middlewares = installations.map(({ middleware }) => middleware).filter(middleware => middleware !== undefined);
    // Identity-elision: an empty middleware list leaves the engine as what the container resolves through.
    const inner = middlewares.length ? new MiddlewareServiceProvider(engine, middlewares) : engine;
    return modelAttach ? modelAttach(inner) : new ServiceProvider(inner);
  }
}

/** The entry point: genesis starts by choosing the lifetime model. */
export namespace di {
  /** Opens a {@link ContainerBuilder} whose manifests and provider run on the given lifetime model. */
  export function usingLifetimeModel<Lifetime>(lifetimeModel: LifetimeModel<Lifetime>): ContainerBuilder<Lifetime> {
    return new DefaultContainerBuilder(lifetimeModel, [], []);
  }
}
