// The `useBrowserLifetime` IHostBuilder augmentation, authored as one named
// object literal.
//
// OPEN receiver: `IHostBuilder` is owned by hosting.core and extended across
// packages, so this const registers into the augmentation registry under the
// shared `typefor<IHostBuilder>()` token (alongside hosting.core's `startHost`
// and hosting's runtime members); the `@augment`-decorated concrete
// `HostBuilder` (in @rhombus-std/hosting) pulls it onto its prototype. The
// interface-side merge for THIS const's member lives here beside it, targeting
// the owning package BARREL (`@rhombus-std/hosting.core`) — the one module
// hosting.core's `startHost` and hosting's runtime members already share, so
// `HostBuilder` still satisfies `implements`. Concrete `IHostBuilder`
// implementers (`HostBuilder` and the internal `HostBuilderAdapter`) inherit
// `useBrowserLifetime` through their own `interface ... extends IHostBuilder`
// merge in @rhombus-std/hosting — no class-side restatement is authored here.

import type { IHostBuilder } from '@rhombus-std/hosting.core';
import type { AugmentationSet2, Flatten } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';
import { BrowserLifetimeOptions } from './BrowserLifetimeOptions';
import { registerBrowserLifetime } from './register-browser-lifetime';

interface IHostBuilderBrowserLifetimeAugmentations {
  /**
   * Listens for the page-lifecycle events and requests a graceful shutdown on
   * a terminal `pagehide` by registering the
   * {@link import("./BrowserLifetime").BrowserLifetime} as the host lifetime
   * (overriding the default NullLifetime). A bfcache (`persisted`) pagehide
   * never stops the host. See the browser-lifetime module documentation for
   * the main.ts stop wiring.
   */
  useBrowserLifetime(configureOptions?: Func<[BrowserLifetimeOptions], void>): this;
}

declare module '@rhombus-std/hosting.core' {
  interface IHostBuilder extends IHostBuilderBrowserLifetimeAugmentations {}
}

/**
 * Registered under the `IHostBuilder` token below; the member is also the
 * standalone call surface.
 */
export const HostBuilderBrowserLifetimeAugmentations: AugmentationSet2<IHostBuilder,
  Flatten<IHostBuilderBrowserLifetimeAugmentations>> = {
    useBrowserLifetime(hostBuilder, configureOptions) {
      const options = new BrowserLifetimeOptions();
      configureOptions?.(options);
      return hostBuilder.configureServices((_context, services) => registerBrowserLifetime(services, options));
    },
  };

registerAugmentations<IHostBuilder>(HostBuilderBrowserLifetimeAugmentations);
