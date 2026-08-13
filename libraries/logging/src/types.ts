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
 * The options type the filter pipeline is keyed at. This is the convergence
 * point: `addLogging` offers it, the builder-level `addFilter`/`setMinimumLevel`
 * append their configure steps to this type's pipeline slots, and
 * logging.config's `addConfig` names the SAME type — so all three compose into
 * the one value {@link LOGGER_FILTER_OPTIONS_ACCESSOR_TYPE} delivers.
 */
export const LOGGER_FILTER_OPTIONS_TYPE: Type = typefor<LoggerFilterOptions>();

/**
 * The address `LoggerFactory` takes its filter options from — what the open
 * `IOptions<$T>` registration answers for {@link LOGGER_FILTER_OPTIONS_TYPE}.
 */
export const LOGGER_FILTER_OPTIONS_ACCESSOR_TYPE: Type = typefor<IOptions<LoggerFilterOptions>>();
