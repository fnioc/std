// Browser hosting for the Generic Host: BrowserLifetime, the
// PageLifecycleEvents bridge, a browser IHostEnvironment factory, and the
// BrowserHost application-builder facade.
//
// Importing this package registers the `useBrowserLifetime` augmentation as a
// side effect, giving the concrete HostBuilder a `useBrowserLifetime()` method.

export { BROWSER_LIFETIME_CATEGORY, BrowserLifetime } from './BrowserLifetime';
export { BrowserLifetimeOptions } from './BrowserLifetimeOptions';
export { registerBrowserLifetime } from './register-browser-lifetime';

export { PageLifecycleEvents, type PageLifecyclePhase } from './PageLifecycleEvents';

export { type BrowserEnvironmentSettings, createBrowserEnvironment } from './browser-environment';

export { BrowserHost, type BrowserHostApplicationBuilderSettings } from './BrowserHost';

export type { DocumentLifecycleEventType, DocumentLike, DocumentVisibilityState, PageContext, PageTransitionEventLike,
  WindowLifecycleEventType, WindowLike } from './page-context';
export { defaultPageContext } from './page-context';

export { BROWSER_LIFETIME_OPTIONS_TOKEN, PAGE_LIFECYCLE_EVENTS_TOKEN } from './tokens';

export { BrowserLifetimeHostBuilderAugmentations } from './BrowserLifetimeHostBuilderAugmentations';
