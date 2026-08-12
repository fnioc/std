// The DI-slot types the hosting runtime registers its framework services
// under, so a user's hosted services can inject them off `IHost.services`.

import type { IConfig } from '@rhombus-std/config.core';
import type { HostBuilderContext, IHostEnvironment, IHostLifetime } from '@rhombus-std/hosting.core';
import { Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { ConsoleLifetimeOptions } from './ConsoleLifetimeOptions';
import type { HostOptions } from './HostOptions';

export const HOST_ENVIRONMENT_TYPE: Type = typefor<IHostEnvironment>();

export const HOST_BUILDER_CONTEXT_TYPE: Type = typefor<HostBuilderContext>();

export const CONFIG_TYPE: Type = typefor<IConfig>();

export const HOST_LIFETIME_TYPE: Type = typefor<IHostLifetime>();

export const HOST_OPTIONS_TYPE: Type = typefor<HostOptions>();

export const CONSOLE_LIFETIME_OPTIONS_TYPE: Type = typefor<ConsoleLifetimeOptions>();

/**
 * Collection type each `configureHostOptions` mutation registers under. The
 * composition resolves the whole set after `build()` and applies each to the
 * shared {@link import("./HostOptions").HostOptions} instance.
 */
export const HOST_OPTIONS_CONFIGURE_TYPE: Type = Type.named('@rhombus-std/hosting/ConfigureHostOptions');
