// HostBuilderAdapter -- the internal IHostBuilder view of a
// HostApplicationBuilder, ported from the reference hosting runtime's private
// `HostApplicationBuilder.HostBuilderAdapter`. It lets external tooling that
// only knows the classic delegate-accumulating `IHostBuilder` drive a modern
// property-based builder: the classic configure* calls are accumulated here and
// replayed onto the application builder's live configuration / services when the
// host is built (`applyChanges`, invoked from `HostApplicationBuilder.build()`).
//
// Reference parity notes / divergences:
//   - Container customization (`useServiceProviderFactory` / `configureContainer`)
//     is a no-op, matching this repo's single-container design (docs §24) -- the
//     application builder's own `configureContainer` is likewise a no-op.
//   - `build()` is unsupported (as in the reference); the adapter only mutates the
//     application builder it wraps.

import type { IConfigBuilder, IConfigManager } from '@rhombus-std/config.core';
import type { IServiceManifest, IServiceManifestHolder } from '@rhombus-std/di.core';
import type { IServiceProviderFactory } from '@rhombus-std/di.core';
import { type HostBuilderContext, HostDefaults, type IHost, type IHostBuilder } from '@rhombus-std/hosting.core';
import { augment, process } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives';
import type { Action, Func } from '@rhombus-toolkit/func';
import { resolveContentRootPath } from '../host-composition';

/** Ordinal case-insensitive comparison, treating an absent value as the empty string. */
function equalsIgnoreCase(left: string | undefined, right: string | undefined): boolean {
  return (left ?? '').toLowerCase() === (right ?? '').toLowerCase();
}

// Interface-extends merge (augmentation doctrine): the `asHostBuilder()` view is
// also an IHostBuilder; binding the interface SYMBOL flows every in-program
// augmentation of it (including downstream `useBrowserLifetime`) onto this concrete
// holder, so it satisfies `implements IHostBuilder` without restating any member.
export interface HostBuilderAdapter extends IHostBuilder {}

/** The classic-builder adapter over a modern application builder. */
@augment(tokenfor<IHostBuilder>())
export class HostBuilderAdapter implements IHostBuilder {
  readonly #config: IConfigManager;
  // The wrapped application builder ITSELF, held as its services slot -- not a
  // snapshot of the manifest. The chain is immutable, so `applyChanges` has to
  // write each delegate's returned manifest back into the live slot; a captured
  // manifest would replay the delegates onto a chain nobody builds from.
  readonly #holder: IServiceManifestHolder;
  readonly #context: HostBuilderContext;

  readonly #configureHostConfigActions: Array<Action<[IConfigBuilder]>> = [];
  readonly #configureAppConfigActions: Array<Action<[HostBuilderContext, IConfigBuilder]>> = [];
  readonly #configureServicesActions: Array<Func<[HostBuilderContext, IServiceManifest], IServiceManifest>> = [];

  public constructor(
    config: IConfigManager,
    holder: IServiceManifestHolder,
    context: HostBuilderContext,
  ) {
    this.#config = config;
    this.#holder = holder;
    this.#context = context;
  }

  /** Shared with the wrapped application builder's context (reference parity). */
  public get properties(): Map<string | symbol, unknown> {
    return this.#context.properties;
  }

  public configureHostConfig(configureDelegate: Action<[IConfigBuilder]>): this {
    this.#configureHostConfigActions.push(configureDelegate);
    return this;
  }

  public configureAppConfig(
    configureDelegate: Action<[HostBuilderContext, IConfigBuilder]>,
  ): this {
    this.#configureAppConfigActions.push(configureDelegate);
    return this;
  }

  public configureServices(
    configureDelegate: Func<[HostBuilderContext, IServiceManifest], IServiceManifest>,
  ): this {
    this.#configureServicesActions.push(configureDelegate);
    return this;
  }

  /** No-op single-container hook (docs §24), mirroring the application builder. */
  public useServiceProviderFactory<TContainerBuilder>(
    _factory: IServiceProviderFactory<TContainerBuilder>,
  ): this {
    return this;
  }

  /** No-op single-container hook (docs §24), mirroring the application builder. */
  public configureContainer<TContainerBuilder>(
    _configureDelegate: Func<[HostBuilderContext, TContainerBuilder], TContainerBuilder>,
  ): this {
    return this;
  }

  /** Not supported: the adapter mutates the application builder, it does not build. */
  public build(): IHost {
    throw new Error('Build is not supported on the HostBuilderAdapter; build the HostApplicationBuilder instead.');
  }

  /**
   * Replays the accumulated delegates onto the wrapped application builder --
   * port of the reference `ApplyChanges`. Host-configuration changes are applied
   * first and then GUARDED: the application name, environment, and content root
   * were already read to build the defaults, so changing them this late is
   * unsupported and throws.
   */
  public applyChanges(): void {
    const config = this.#config;

    if (this.#configureHostConfigActions.length > 0) {
      const previousApplicationName = config.get(HostDefaults.applicationKey);
      const previousEnvironment = config.get(HostDefaults.environmentKey);
      const previousContentRootConfig = config.get(HostDefaults.contentRootKey);
      const previousContentRootPath = this.#context.hostingEnvironment.contentRootPath;

      for (const action of this.#configureHostConfigActions) {
        action(config);
      }

      if (!equalsIgnoreCase(previousApplicationName, config.get(HostDefaults.applicationKey))) {
        throw new Error(
          `The application name changed from "${previousApplicationName}" to `
            + `"${config.get(HostDefaults.applicationKey)}". Changing host settings after the `
            + 'host builder adapter has been created is not supported.',
        );
      }
      if (!equalsIgnoreCase(previousEnvironment, config.get(HostDefaults.environmentKey))) {
        throw new Error(
          `The environment changed from "${previousEnvironment}" to `
            + `"${config.get(HostDefaults.environmentKey)}". Changing host settings after the `
            + 'host builder adapter has been created is not supported.',
        );
      }
      // A content-root change is allowed only when it resolves back to the same
      // path the environment was built with; anything else is unsupported.
      const currentContentRootConfig = config.get(HostDefaults.contentRootKey);
      if (
        !equalsIgnoreCase(previousContentRootConfig, currentContentRootConfig)
        && !equalsIgnoreCase(
          previousContentRootPath,
          resolveContentRootPath(currentContentRootConfig, process.cwd()),
        )
      ) {
        throw new Error(
          `The content root changed from "${previousContentRootConfig}" to `
            + `"${currentContentRootConfig}". Changing host settings after the host builder `
            + 'adapter has been created is not supported.',
        );
      }
    }

    for (const action of this.#configureAppConfigActions) {
      action(this.#context, config);
    }
    for (const action of this.#configureServicesActions) {
      this.#holder.services = action(this.#context, this.#holder.services);
    }
  }
}
