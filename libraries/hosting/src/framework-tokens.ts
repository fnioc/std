// The DI-slot tokens the hosting runtime registers its framework services
// under, so a user's hosted services can inject them off `IHost.services`.

import type { IConfig } from '@rhombus-std/config.core';
import type { HostBuilderContext, IHostEnvironment, IHostLifetime } from '@rhombus-std/hosting.core';
import { tokenfor } from '@rhombus-std/primitives.extras';
import type { ConsoleLifetimeOptions } from './ConsoleLifetimeOptions';
import type { HostOptions } from './HostOptions';

/** string the built {@link IHostEnvironment} is registered under. */
export const HOST_ENVIRONMENT_TOKEN: string = tokenfor<IHostEnvironment>();

/** string the {@link HostBuilderContext} is registered under. */
export const HOST_BUILDER_CONTEXT_TOKEN: string = tokenfor<HostBuilderContext>();

/** string the merged application {@link IConfig} is registered under. */
export const CONFIG_TOKEN: string = tokenfor<IConfig>();

/** string the host's {@link IHostLifetime} is registered under. */
export const HOST_LIFETIME_TOKEN: string = tokenfor<IHostLifetime>();

/** string the resolved {@link HostOptions} value is registered under. */
export const HOST_OPTIONS_TOKEN: string = tokenfor<HostOptions>();

/** string the {@link ConsoleLifetimeOptions} value is registered under. */
export const CONSOLE_LIFETIME_OPTIONS_TOKEN: string = tokenfor<ConsoleLifetimeOptions>();

/**
 * Collection token each `configureHostOptions` mutation registers under. The
 * composition resolves the whole set after `build()` and applies each to the
 * shared {@link import("./HostOptions").HostOptions} instance.
 */
export const HOST_OPTIONS_CONFIGURE_TOKEN: string = '@rhombus-std/hosting/ConfigureHostOptions';
