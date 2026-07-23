// The DI-slot tokens the hosting RUNTIME registers its framework services under
// so a user's hosted services can inject them. The two CANONICAL tokens
// (`HOSTED_SERVICE_TOKEN`, `HOST_APPLICATION_LIFETIME_TOKEN`) already live in the
// abstractions substrate `@rhombus-std/hosting.core` because both the
// registration and resolution sides depend on them there; the tokens below are
// specific to the runtime composition (`HostBuilder` / `HostApplicationBuilder`
// register the framework singletons, and user code resolves them off
// `IHost.services`), so they live with the runtime rather than the abstractions.

import type { IConfig } from '@rhombus-std/config.core';
import type { Token } from '@rhombus-std/di.core';
import type { HostBuilderContext, IHostEnvironment, IHostLifetime } from '@rhombus-std/hosting.core';
import { tokenfor } from '@rhombus-std/primitives';
import type { ConsoleLifetimeOptions } from './ConsoleLifetimeOptions';
import type { HostOptions } from './HostOptions';

/** Token the built {@link IHostEnvironment} is registered under. */
export const HOST_ENVIRONMENT_TOKEN: Token = tokenfor<IHostEnvironment>();

/** Token the {@link HostBuilderContext} is registered under. */
export const HOST_BUILDER_CONTEXT_TOKEN: Token = tokenfor<HostBuilderContext>();

/** Token the merged application {@link IConfig} is registered under. */
export const CONFIG_TOKEN: Token = tokenfor<IConfig>();

/** Token the host's {@link IHostLifetime} is registered under. */
export const HOST_LIFETIME_TOKEN: Token = tokenfor<IHostLifetime>();

/** Token the resolved {@link HostOptions} value is registered under. */
export const HOST_OPTIONS_TOKEN: Token = tokenfor<HostOptions>();

/** Token the {@link ConsoleLifetimeOptions} value is registered under. */
export const CONSOLE_LIFETIME_OPTIONS_TOKEN: Token = tokenfor<ConsoleLifetimeOptions>();

/**
 * Collection token each `configureHostOptions` mutation registers under. The
 * composition resolves the whole set after `build()` and applies each to the
 * shared {@link import("./HostOptions").HostOptions} instance -- the
 * container-mediated stand-in for the reference's
 * `Configure<HostOptions>` options-pipeline registration.
 */
export const HOST_OPTIONS_CONFIGURE_TOKEN: Token = '@rhombus-std/hosting/ConfigureHostOptions';
