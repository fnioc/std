// The DI-slot tokens the hosting RUNTIME registers its framework services under
// so a user's hosted services can inject them. The two CANONICAL tokens
// (`HOSTED_SERVICE_TOKEN`, `HOST_APPLICATION_LIFETIME_TOKEN`) already live in the
// abstractions substrate `@rhombus-std/hosting.core` because both the
// registration and resolution sides depend on them there; the tokens below are
// specific to the runtime composition (`HostBuilder` / `HostApplicationBuilder`
// register the framework singletons, and user code resolves them off
// `IHost.services`), so they live with the runtime rather than the abstractions.

import type { Token } from '@rhombus-std/di.core';

/** Token the built {@link import("@rhombus-std/hosting.core").IHostEnvironment} is registered under. */
export const HOST_ENVIRONMENT_TOKEN: Token = '@rhombus-std/hosting/IHostEnvironment';

/** Token the {@link import("@rhombus-std/hosting.core").HostBuilderContext} is registered under. */
export const HOST_BUILDER_CONTEXT_TOKEN: Token = '@rhombus-std/hosting/HostBuilderContext';

/** Token the merged application {@link import("@rhombus-std/config.core").IConfig} is registered under. */
export const CONFIGURATION_TOKEN: Token = '@rhombus-std/hosting/IConfig';

/** Token the host's {@link import("@rhombus-std/hosting.core").IHostLifetime} is registered under. */
export const HOST_LIFETIME_TOKEN: Token = '@rhombus-std/hosting/IHostLifetime';

/** Token the resolved {@link import("./HostOptions").HostOptions} value is registered under. */
export const HOST_OPTIONS_TOKEN: Token = '@rhombus-std/hosting/HostOptions';

/** Token the {@link import("./ConsoleLifetimeOptions").ConsoleLifetimeOptions} value is registered under. */
export const CONSOLE_LIFETIME_OPTIONS_TOKEN: Token = '@rhombus-std/hosting/ConsoleLifetimeOptions';

/**
 * Collection token each `configureHostOptions` mutation registers under. The
 * composition resolves the whole set after `build()` and applies each to the
 * shared {@link import("./HostOptions").HostOptions} instance -- the
 * container-mediated stand-in for the reference's
 * `Configure<HostOptions>` options-pipeline registration.
 */
export const HOST_OPTIONS_CONFIGURE_TOKEN: Token = '@rhombus-std/hosting/ConfigureHostOptions';
