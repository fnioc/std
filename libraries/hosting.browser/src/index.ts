// Browser hosting for the Generic Host: BrowserLifetime, the
// PageLifecycleEvents bridge, a browser IHostEnvironment factory, and the
// BrowserHost application-builder facade.
//
// Importing this package registers the `useBrowserLifetime` augmentation as a
// side effect, giving the concrete HostBuilder a `useBrowserLifetime()` method.

export * from './BrowserLifetime';
export * from './BrowserLifetimeOptions';
export * from './register-browser-lifetime';

export * from './PageLifecycleEvents';

export * from './browser-environment';

export * from './BrowserHost';

export * from './page-context';

export * from './types';

export * from './HostBuilder-BrowserLifetime-augmentations';
