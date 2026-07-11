// Public entry point for @rhombus-std/hosting.browser — browser hosting for
// the Generic Host. Ships the BrowserLifetime (page-lifecycle-driven shutdown
// that never disqualifies the page from the back/forward cache — no
// unload/beforeunload anywhere), the PageLifecycleEvents bridge (phase
// snapshot + subscribe shaped for useSyncExternalStore, the recurring flush
// signal, the bfcache-restore event), a browser IHostEnvironment factory, and
// the BrowserHost.createApplicationBuilder facade.
//
// IMPORTING THIS PACKAGE HAS A SIDE EFFECT: it registers the
// `useBrowserLifetime` augmentation set against hosting.core's IHostBuilder
// token, so the @augment-decorated concrete HostBuilder gains the fluent
// `useBrowserLifetime()` method form.
//
// STOP WIRING (the one line main.ts owns): the built host is not resolvable
// from the container, so the lifetime only REQUESTS shutdown
// (stopApplication); drive the pipeline yourself —
//
//   const host = BrowserHost.createApplicationBuilder({ ... }).build();
//   const lifetime = host.services.resolve<IHostApplicationLifetime>(
//     HOST_APPLICATION_LIFETIME_TOKEN,
//   );
//   lifetime.applicationStopping.addEventListener("abort", () => {
//     void host.stop();
//   }, { once: true });
//   await host.start();

// The lifetime + its options.
export { BROWSER_LIFETIME_CATEGORY, BrowserLifetime } from "./browser-lifetime";
export { BrowserLifetimeOptions } from "./BrowserLifetimeOptions";
export { registerBrowserLifetime } from "./register-browser-lifetime";

// The page-lifecycle bridge.
export { PageLifecycleEvents, type PageLifecyclePhase } from "./PageLifecycleEvents";

// The browser environment factory.
export { type BrowserEnvironmentSettings, createBrowserEnvironment } from "./browser-environment";

// The builder facade.
export { BrowserHost, type BrowserHostApplicationBuilderSettings } from "./BrowserHost";

// The structural page typings (injectable for tests).
export type {
  DocumentLifecycleEventType,
  DocumentLike,
  DocumentVisibilityState,
  PageContext,
  PageTransitionEventLike,
  WindowLifecycleEventType,
  WindowLike,
} from "./page-context";
export { defaultPageContext } from "./page-context";

// The DI-slot tokens this package registers under.
export { BROWSER_LIFETIME_OPTIONS_TOKEN, PAGE_LIFECYCLE_EVENTS_TOKEN } from "./tokens";

// The IHostBuilder augmentation set (+ its side-effect registration).
export { BrowserLifetimeHostBuilderExtensions } from "./builder-augmentations";
