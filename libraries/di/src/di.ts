import { DefaultManifest, IServiceProvider, type LifetimeModel, type Manifest, type Realizer, type ScopeFactory, type ServiceDescriptor } from '@rhombus-std/di.core';
import { concat, iterable } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';
import { ServiceProvider } from './ServiceProvider.js';
import { ServiceProviderOptions } from './ServiceProviderOptions.js';

/**
 * Assembles a service provider: every genesis input — the manifest content and the provider
 * options — arrives through this one surface, and {@link build} seals them into a provider.
 */
export interface ContainerBuilder<Lifetime> {
  /** Composes registrations onto the manifest; delegates apply in call order, each receiving the previous one's result. */
  configureServices(configure: Func<[Manifest<Lifetime>], Manifest<Lifetime>>): ContainerBuilder<Lifetime>;

  /**
   * Seeds the manifest from an existing descriptor stream, discarding anything configured before
   * this call — the descriptor stream layers over the model floor, never replacing it.
   * @param manifest - iteration order is registration order (newest first), exactly as a
   * {@link Manifest} iterates.
   */
  usingManifest(manifest: Iterable<ServiceDescriptor<Lifetime>>): ContainerBuilder<Lifetime>;

  /** Composes provider options; delegates apply in call order, each receiving the previous one's result. */
  configureProvider(configure: Func<[ServiceProviderOptions], ServiceProviderOptions>): ContainerBuilder<Lifetime>;

  /** Seals the configured manifest into a provider. */
  build(): IServiceProvider<Lifetime>;
}

export class DefaultContainerBuilder<Lifetime> implements ContainerBuilder<Lifetime> {
  readonly #lifetimeModel: LifetimeModel<Lifetime>;
  readonly #manifestSteps: Iterable<Func<[Manifest<Lifetime>], Iterable<ServiceDescriptor<Lifetime>>>>;
  readonly #optionSteps: Iterable<Func<[ServiceProviderOptions], ServiceProviderOptions>>;

  constructor(
    lifetimeModel: LifetimeModel<Lifetime>,
    manifestSteps: Iterable<Func<[Manifest<Lifetime>], Iterable<ServiceDescriptor<Lifetime>>>>,
    optionSteps: Iterable<Func<[ServiceProviderOptions], ServiceProviderOptions>>,
  ) {
    this.#lifetimeModel = lifetimeModel;
    this.#manifestSteps = manifestSteps;
    this.#optionSteps = optionSteps;
  }

  configureServices(configure: Func<[Manifest<Lifetime>], Iterable<ServiceDescriptor<Lifetime>>>): ContainerBuilder<Lifetime> {
    return new DefaultContainerBuilder(
      this.#lifetimeModel,
      iterable(() => concat(this.#manifestSteps, configure)),
      this.#optionSteps,
    );
  }

  usingManifest(manifest: Iterable<ServiceDescriptor<Lifetime>>): ContainerBuilder<Lifetime> {
    return new DefaultContainerBuilder(
      this.#lifetimeModel,
      [floor => new DefaultManifest<Lifetime>(() => concat(manifest, floor))],
      this.#optionSteps,
    );
  }

  configureProvider(configure: Func<[ServiceProviderOptions], ServiceProviderOptions>): ContainerBuilder<Lifetime> {
    return new DefaultContainerBuilder(
      this.#lifetimeModel,
      this.#manifestSteps,
      iterable(() => concat(this.#optionSteps, configure)),
    );
  }

  build(): IServiceProvider<Lifetime> {
    const floor = DefaultManifest.empty<Lifetime>().apply(() => this.#lifetimeModel.addModelServices());
    const manifest = Iterator.from(this.#manifestSteps).reduce((manifest, step) => new DefaultManifest(step(manifest)), floor);
    const options = Iterator.from(this.#optionSteps).reduce((options, step) => step(options), ServiceProviderOptions.defaults);
    const { realizer, scopeFactory } = this.#lifetimeModel.createRealizer() as {
      realizer: Realizer;
      scopeFactory?: Func<[IServiceProvider], ScopeFactory<readonly any[]>>;
    };
    return new ServiceProvider(realizer, scopeFactory, manifest as Manifest<unknown>, options) as IServiceProvider<Lifetime>;
  }
}

/** The entry point: genesis starts by choosing the lifetime model. */
export namespace di {
  /** Opens a {@link ContainerBuilder} whose manifests and provider run on the given lifetime model. */
  export function usingLifetimeModel<Lifetime>(lifetimeModel: LifetimeModel<Lifetime>): ContainerBuilder<Lifetime> {
    return new DefaultContainerBuilder(lifetimeModel, [], []);
  }
}
