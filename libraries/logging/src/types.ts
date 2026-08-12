// The di.core service types the logging registrations bind to.

import type { ILoggerFactory, ILoggerProvider } from '@rhombus-std/logging.core';
import type { IOptions } from '@rhombus-std/options';
import { Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { LoggerFilterOptions } from './LoggerFilterOptions';

/** The singleton {@link ILoggerFactory} `addLogging` registers. */
export const LOGGER_FACTORY_TYPE: Type = typefor<ILoggerFactory>();

/**
 * The type each {@link ILoggerProvider} registered via `addProvider` binds to.
 * Registered as an ENUMERABLE (repeated `addValue` under one type) so the
 * `LoggerFactory` registration resolves the whole set.
 */
export const LOGGER_PROVIDER_TYPE: Type = typefor<ILoggerProvider>();

/**
 * The `IOptions<LoggerFilterOptions>` wrapper the assembly is keyed at, NOT the
 * bare `LoggerFilterOptions` type. This is the convergence point: `addLogging`
 * registers the assembly here, the builder-level `addFilter`/`setMinimumLevel`
 * append their configure steps to this type's pipeline slots, and
 * logging.config's `addConfig` derives the SAME type inline — so all three
 * compose into one `IOptions<LoggerFilterOptions>` the `LoggerFactory` consumes.
 */
export const LOGGER_FILTER_OPTIONS_TYPE: Type = typefor<IOptions<LoggerFilterOptions>>();
