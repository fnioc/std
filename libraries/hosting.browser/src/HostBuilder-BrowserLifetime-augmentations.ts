// The `useBrowserLifetime` IHostBuilder augmentation, authored as one named
// namespace.
//
// OPEN receiver: `IHostBuilder` is owned by hosting.core and extended across
// packages, so this namespace registers into the augmentation registry under the
// shared `typefor<IHostBuilder>()` type (alongside hosting.core's `startHost`
// and hosting's runtime members); the `@augment`-decorated concrete
// `HostBuilder` (in @rhombus-std/hosting) pulls it onto its prototype. The
// interface-side merge for THIS namespace's member lives here beside it, targeting
// the owning package BARREL (`@rhombus-std/hosting.core`) — the one module
// hosting.core's `startHost` and hosting's runtime members already share, so
// `HostBuilder` still satisfies `implements`. Concrete `IHostBuilder`
// implementers (`HostBuilder` and the internal `HostBuilderAdapter`) inherit
// `useBrowserLifetime` through their own `interface ... extends IHostBuilder`
// merge in @rhombus-std/hosting — no class-side restatement is authored here.

import type { IHostBuilder } from '@rhombus-std/hosting.core';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';
import type { Flatten } from '@rhombus-toolkit/type-helpers';
import { BrowserLifetimeOptions } from './BrowserLifetimeOptions';
import { registerBrowserLifetime } from './register-browser-lifetime';

/**
 * Registered under the `IHostBuilder` type below; the member is also the
 * standalone call surface.
 */
export namespace HostBuilderBrowserLifetimeAugmentations {
  /**
   * Listens for the page-lifecycle events and requests a graceful shutdown on
   * a terminal `pagehide` by registering the
   * {@link import("./BrowserLifetime").BrowserLifetime} as the host lifetime
   * (overriding the default NullLifetime). A bfcache (`persisted`) pagehide
   * never stops the host. See the browser-lifetime module documentation for
   * the main.ts stop wiring.
   */
  export function useBrowserLifetime<Self extends IHostBuilder>(this: Self, configureOptions?: Func<[BrowserLifetimeOptions], void>): Self {
    const options = new BrowserLifetimeOptions();
    configureOptions?.(options);
    return this.configureServices((_context, services) => registerBrowserLifetime(services, options));
  }
}

declare module '@rhombus-std/hosting.core' {
  interface IHostBuilder extends Flatten<typeof HostBuilderBrowserLifetimeAugmentations> {}
}

registerAugmentations<IHostBuilder>(HostBuilderBrowserLifetimeAugmentations);
