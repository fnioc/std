// The `useBrowserLifetime` IHostBuilder augmentation — the browser analog of
// hosting's `useConsoleLifetime` (its §38 model), authored as one named object
// literal (docs §28), `satisfies AugmentationSet<IHostBuilder>`.
//
// OPEN receiver (docs §38): `IHostBuilder` is owned by hosting.core and
// extended across packages, so this const registers into the augmentation
// registry under the shared `nameof<IHostBuilder>()` token (alongside
// hosting.core's `startHost` and hosting's nine runtime members); the
// `@augment`-decorated concrete `HostBuilder` (in @rhombus-std/hosting) pulls
// it onto its prototype. The interface-side merge for THIS const's member
// lives here beside it (rule 0.6), targeting the DECLARING module (the
// `internal/*` subpath — the merge-identity rule); as this is a FOREIGN
// receiver class, the class-side merge onto the concrete `HostBuilder` lives
// here too.

import type { IHostBuilder } from "@rhombus-std/hosting.core";
import { type AugmentationSet, registerAugmentations } from "@rhombus-std/primitives";
import { nameof } from "@rhombus-std/primitives.transformer/internal/nameof";
import type { Func } from "@rhombus-toolkit/func";
import { BrowserLifetimeOptions } from "./BrowserLifetimeOptions";
import { registerBrowserLifetime } from "./register-browser-lifetime";

declare module "@rhombus-std/hosting.core/internal/IHostBuilder" {
  interface IHostBuilder {
    useBrowserLifetime(configureOptions?: Func<[BrowserLifetimeOptions], void>): this;
  }
}

declare module "@rhombus-std/hosting/internal/HostBuilder" {
  interface HostBuilder {
    useBrowserLifetime(configureOptions?: Func<[BrowserLifetimeOptions], void>): this;
  }
}

/**
 * The `BrowserLifetimeHostBuilderExtensions` augmentation set for
 * {@link IHostBuilder} (docs §28/§38). Registered under the `IHostBuilder`
 * token below; the member is also the standalone call surface.
 */
export const BrowserLifetimeHostBuilderExtensions = {
  /**
   * Listens for the page-lifecycle events and requests a graceful shutdown on
   * a terminal `pagehide` by registering the
   * {@link import("./browser-lifetime").BrowserLifetime} as the host lifetime
   * (overriding the default NullLifetime). A bfcache (`persisted`) pagehide
   * never stops the host. See the browser-lifetime module documentation for
   * the main.ts stop wiring.
   */
  useBrowserLifetime(
    hostBuilder: IHostBuilder,
    configureOptions?: Func<[BrowserLifetimeOptions], void>,
  ): IHostBuilder {
    const options = new BrowserLifetimeOptions();
    configureOptions?.(options);
    return hostBuilder.configureServices((_context, services) => {
      registerBrowserLifetime(services, options);
    });
  },
} satisfies AugmentationSet<IHostBuilder>;

registerAugmentations(nameof<IHostBuilder>(), BrowserLifetimeHostBuilderExtensions);
