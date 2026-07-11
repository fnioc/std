// The browser IHostEnvironment factory. A browser page has no filesystem:
// the content root collapses to the posix root "/" and the content-root file
// provider is the NullFileProvider (every lookup misses, watch monitors
// nothing) — the same default hosting's HostingEnvironment carries while the
// physical provider stays deferred (decisions.md §20).
//
// The backing class mirrors hosting's internal `HostingEnvironment`: decorated
// `@augment(nameof<IHostEnvironment>())` so it pulls hosting.core's
// environment predicates (isDevelopment/…) from the augmentation registry, and
// class-side-merged below so it still SATISFIES the fully-merged interface.

import { NullFileProvider } from '@rhombus-std/fileproviders.core';
import { Environments, type IHostEnvironment } from '@rhombus-std/hosting.core';
import { augment } from '@rhombus-std/primitives';
import { nameof } from '@rhombus-std/primitives.transformer/internal/nameof';

/** The name/application settings the browser environment reads. */
export interface BrowserEnvironmentSettings {
  /** The environment name; defaults to {@link Environments.Production}. */
  environmentName?: string;
  /** The application name; defaults to the empty string. */
  applicationName?: string;
}

// The class-side merge for the registry-installed environment predicates
// (hosting.core's HostEnvironmentEnvExtensions) — the interface-side merge
// lives beside that const in hosting.core.
declare module './browser-environment' {
  interface BrowserHostingEnvironment {
    isEnvironment(environmentName: string): boolean;
    isDevelopment(): boolean;
    isStaging(): boolean;
    isProduction(): boolean;
  }
}

/** The mutable browser {@link IHostEnvironment} — see the module documentation. */
@augment(nameof<IHostEnvironment>())
export class BrowserHostingEnvironment implements IHostEnvironment {
  public environmentName: string = Environments.Production;
  public applicationName = '';
  public contentRootPath = '/';
  public contentRootFileProvider: IHostEnvironment['contentRootFileProvider'] = new NullFileProvider();
}

/**
 * Creates a browser {@link IHostEnvironment}: names from `settings`, content
 * root `"/"`, and a {@link NullFileProvider}. The BrowserHost facade routes
 * the same values through the ordinary builder settings instead (so the
 * builder's own environment IS browser-shaped); this standalone factory
 * serves classic-builder compositions and tests.
 */
export function createBrowserEnvironment(settings: BrowserEnvironmentSettings = {}): IHostEnvironment {
  const environment = new BrowserHostingEnvironment();
  if (settings.environmentName !== undefined) {
    environment.environmentName = settings.environmentName;
  }
  if (settings.applicationName !== undefined) {
    environment.applicationName = settings.applicationName;
  }
  return environment;
}
