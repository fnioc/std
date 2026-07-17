// The di.core string tokens the logging registrations bind to. Namespaced by
// the package name per the di.core "pkg:IFace" token convention.

import type { ILoggerFactory, ILoggerProvider } from '@rhombus-std/logging.core';
import type { IOptions } from '@rhombus-std/options';
import { nameof } from '@rhombus-std/primitives';
import type { LoggerFilterOptions } from './LoggerFilterOptions';

/**
 * Token for the singleton {@link ILoggerFactory} registered by `addLogging`.
 * Derived via `nameof<ILoggerFactory>()` so it keys the type's DECLARING
 * package (logging.core), the grammar every other framework token uses.
 */
export const LOGGER_FACTORY_TOKEN = nameof<ILoggerFactory>();

/**
 * Token each {@link ILoggerProvider} registered via `addProvider` binds to.
 * Registered as an ENUMERABLE (repeated `addValue` under one token) so the
 * `LoggerFactory` registration resolves the whole set — the di.core analog of
 * the reference `IEnumerable<ILoggerProvider>` injection.
 * Derived via `nameof<ILoggerProvider>()` so it keys the type's DECLARING
 * package (logging.core).
 */
export const LOGGER_PROVIDER_TOKEN = nameof<ILoggerProvider>();

/**
 * Token the `IOptions<LoggerFilterOptions>` assembly is keyed at — the
 * `nameof<IOptions<LoggerFilterOptions>>()` wrapper token
 * (`"@rhombus-std/options:IOptions<@rhombus-std/logging:LoggerFilterOptions>"`),
 * NOT the bare `LoggerFilterOptions` type token. This is the convergence point
 * (#146): `addLogging` registers the assembly here, the builder-level
 * `addFilter`/`setMinimumLevel` append their configure steps to this token's
 * pipeline slots, and logging.config's `addConfig` derives the
 * SAME token inline from the type — so all three compose into one
 * `IOptions<LoggerFilterOptions>` the `LoggerFactory` consumes. The reference
 * keys this pipeline by the options TYPE (`Configure<LoggerFilterOptions>` /
 * `IOptionsMonitor<LoggerFilterOptions>`); the `IOptions<T>` wrapper token is the
 * di.core analog of that `IOptionsMonitor<T>` service identity, and matches the
 * repo convention that an options assembly is registered at `token(IOptions<T>)`.
 */
export const LOGGER_FILTER_OPTIONS_TOKEN = nameof<IOptions<LoggerFilterOptions>>();
