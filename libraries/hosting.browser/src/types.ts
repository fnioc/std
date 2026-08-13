// The DI-slot types this package's registrations bind to. The hosting-family
// types this package RESOLVES (HOST_LIFETIME_TYPE, HOST_APPLICATION_LIFETIME_TYPE,
// LOGGER_FACTORY_TYPE, RESOLVER_TYPE) are imported from their owning packages —
// never restated.

import { Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { BrowserLifetimeOptions } from './BrowserLifetimeOptions';
import type { PageLifecycleEvents } from './PageLifecycleEvents';

export const BROWSER_LIFETIME_OPTIONS_TYPE: Type = typefor<BrowserLifetimeOptions>();

/**
 * The {@link import("./PageLifecycleEvents").PageLifecycleEvents} bridge, a
 * VALUE registration by the BrowserHost facade — so every consumer resolves the
 * SAME eagerly-attached instance.
 */
export const PAGE_LIFECYCLE_EVENTS_TYPE: Type = typefor<PageLifecycleEvents>();
