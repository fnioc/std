// The `useBrowserLifetime` IHostBuilder augmentation — the browser analog of
// hosting's `useConsoleLifetime` (its §38 model), authored as one named object
// literal (docs §28), `satisfies AugmentationSet<IHostBuilder>`.
//
// OPEN receiver (docs §38): `IHostBuilder` is owned by hosting.core and
// extended across packages, so this const registers into the augmentation
// registry under the shared `tokenfor<IHostBuilder>()` token (alongside
// hosting.core's `startHost` and hosting's nine runtime members); the
// `@augment`-decorated concrete `HostBuilder` (in @rhombus-std/hosting) pulls
// it onto its prototype. The interface-side merge for THIS const's member
// lives here beside it (rule 0.6), targeting the owning package BARREL
// (`@rhombus-std/hosting.core`): a cross-package merge onto an OPEN receiver
// only reaches a published consumer if the specifier survives publish, so every
// IHostBuilder merge site resolves through the barrel (§47) — the one module
// hosting.core's `startHost` and hosting's runtime members already share, which
// keeps the §38 merge-identity relation intact so `HostBuilder` still satisfies
// `implements`. Concrete `IHostBuilder` implementers (`HostBuilder` and the
// internal `HostBuilderAdapter`) inherit `useBrowserLifetime` through their own
// `interface ... extends IHostBuilder` merge in @rhombus-std/hosting — no
// class-side restatement is authored here (and none may be: a cross-package merge
// onto hosting's `internal/*` subpath would be scrubbed at publish, silently
// dropping the member for published consumers, the #168 hazard).

import type { IHostBuilder } from '@rhombus-std/hosting.core';
import { type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';
import { BrowserLifetimeOptions } from './BrowserLifetimeOptions';
import { registerBrowserLifetime } from './register-browser-lifetime';

declare module '@rhombus-std/hosting.core' {
  interface IHostBuilder {
    useBrowserLifetime(configureOptions?: Func<[BrowserLifetimeOptions], void>): this;
  }
}

/**
 * The `BrowserLifetimeHostBuilderAugmentations` augmentation set for
 * {@link IHostBuilder} (docs §28/§38). Registered under the `IHostBuilder`
 * token below; the member is also the standalone call surface.
 */
export const BrowserLifetimeHostBuilderAugmentations = {
  /**
   * Listens for the page-lifecycle events and requests a graceful shutdown on
   * a terminal `pagehide` by registering the
   * {@link import("./BrowserLifetime").BrowserLifetime} as the host lifetime
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
    return hostBuilder.configureServices((_context, services) => registerBrowserLifetime(services, options));
  },
} satisfies AugmentationSet<IHostBuilder>;

registerAugmentations(tokenfor<IHostBuilder>(), BrowserLifetimeHostBuilderAugmentations);
