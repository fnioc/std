// The DI-slot tokens this package's registrations bind to, in the di.core
// "<package>:<TypeName>" convention (the production nameof lowering). The
// hosting-family tokens this package RESOLVES (HOST_LIFETIME_TOKEN,
// HOST_APPLICATION_LIFETIME_TOKEN, LOGGER_FACTORY_TOKEN, RESOLVER_TOKEN) are
// imported from their owning packages — never restated.

import type { Token } from '@rhombus-std/di.core';
import { nameof } from '@rhombus-std/primitives';
import type { BrowserLifetimeOptions } from './BrowserLifetimeOptions';
import type { PageLifecycleEvents } from './PageLifecycleEvents';

/** Token the {@link import("./BrowserLifetimeOptions").BrowserLifetimeOptions} value is registered under. */
export const BROWSER_LIFETIME_OPTIONS_TOKEN: Token = nameof<BrowserLifetimeOptions>();

/**
 * Token the {@link import("./PageLifecycleEvents").PageLifecycleEvents} bridge
 * is registered under (a VALUE registration by the BrowserHost facade, so
 * every consumer resolves the SAME eagerly-attached instance).
 */
export const PAGE_LIFECYCLE_EVENTS_TOKEN: Token = nameof<PageLifecycleEvents>();
