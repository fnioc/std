import { type AddonInstallation, type ChainAddon, DefaultManifest, IServiceProvider, type LifetimeModel, Manifest, type Registration } from '@rhombus-std/di.core';
import { concat, iterable, type Type } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';
import { Engine } from './internal/Engine.js';
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

  /** Installs `addon` beside the lifetime model; addons contribute in the order they were added. */
  withAddon(addon: ChainAddon<Lifetime>): ContainerBuilder<Lifetime>;

  /** Seals the configured manifest into a provider. */
  build(): IServiceProvider;
}

/**
 * Names one handler in the composed chain and links it to the handler it forwards to, so
 * `console.dir` on the provider's own handler expands layer by layer out to the engine's door.
 */
function inspectable<Lifetime>(
  handler: Func<[Type], unknown>,
  name: string,
  links: { next?: Func<[Type], unknown>; addon?: AddonInstallation<Lifetime>; },
): Func<[Type], unknown> {
  Object.defineProperty(handler, 'name', { value: name, configurable: true });
  return Object.assign(handler, links);
}

export class DefaultContainerBuilder<Lifetime> implements ContainerBuilder<Lifetime> {
  readonly #lifetimeModel: LifetimeModel<Lifetime>;
  readonly #manifestSteps: Iterable<Func<[Manifest<Lifetime>], Iterable<Registration<Lifetime>>>>;
  readonly #addons: Iterable<ChainAddon<Lifetime>>;

  constructor(
    lifetimeModel: LifetimeModel<Lifetime>,
    manifestSteps: Iterable<Func<[Manifest<Lifetime>], Iterable<Registration<Lifetime>>>>,
    addons: Iterable<ChainAddon<Lifetime>>,
  ) {
    this.#lifetimeModel = lifetimeModel;
    this.#manifestSteps = manifestSteps;
    this.#addons = addons;
  }

  configureServices(configure: Func<[Manifest<Lifetime>], Iterable<Registration<Lifetime>>>): ContainerBuilder<Lifetime> {
    return new DefaultContainerBuilder(
      this.#lifetimeModel,
      iterable(() => concat(this.#manifestSteps, configure)),
      this.#addons,
    );
  }

  usingManifest(manifest: Iterable<Registration<Lifetime>>): ContainerBuilder<Lifetime> {
    return new DefaultContainerBuilder(
      this.#lifetimeModel,
      [floor => new DefaultManifest<Lifetime>(() => concat(manifest, floor))],
      this.#addons,
    );
  }

  withAddon(addon: ChainAddon<Lifetime>): ContainerBuilder<Lifetime> {
    return new DefaultContainerBuilder(
      this.#lifetimeModel,
      this.#manifestSteps,
      iterable(() => concat(this.#addons, addon)),
    );
  }

  build(): IServiceProvider {
    const { wrapResolve, scopeFactory } = this.#lifetimeModel.install();
    const installations = Iterator.from(this.#addons).map(addon => addon.install()).toArray();
    const floor = scopeFactory ? Manifest.empty<Lifetime>().add(scopeFactory) : Manifest.empty<Lifetime>();
    const filed = installations.reduce(
      (manifest, { registrations }) => registrations ? new DefaultManifest<Lifetime>(() => concat(registrations, manifest)) : manifest,
      floor,
    );
    const manifest = Iterator.from(this.#manifestSteps).reduce((manifest, step) => new DefaultManifest(step(manifest)), filed);
    const engine = new Engine(manifest);
    // Addons file their hooks first, so the lifetime model — filed last — composes innermost,
    // closest to the construction. With nothing to wrap, the handler is the identity chain — the
    // user-facing provider is always this wrap.
    const layers: Array<{ name: string; wrapResolve?: AddonInstallation<Lifetime>['wrapResolve']; addon?: AddonInstallation<Lifetime>; }> = [
      ...installations.map((addon, index) => ({ name: `addon${index}`, wrapResolve: addon.wrapResolve, addon })),
      { name: this.#lifetimeModel.name, wrapResolve },
    ];
    const provider = new ServiceProvider(self =>
      layers.reduce(
        (next, { name, wrapResolve: wrap, addon }) => wrap ? inspectable(wrap(next, self), name, { next, ...addon && { addon } }) : next,
        inspectable((address: Type) => engine.getService(address), 'engine.getService', {}),
      )
    );
    for (const installation of installations) {
      installation.atBuild?.(engine);
    }
    return provider;
  }
}

/** The entry point: genesis starts by choosing the lifetime model. */
export namespace di {
  /** Opens a {@link ContainerBuilder} whose manifests and provider run on the given lifetime model. */
  export function usingLifetimeModel<Lifetime>(lifetimeModel: LifetimeModel<Lifetime>): ContainerBuilder<Lifetime> {
    return new DefaultContainerBuilder(lifetimeModel, [], []);
  }
}
