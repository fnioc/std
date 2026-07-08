// The di.core string tokens the logging registrations bind to. Namespaced by
// the package name per the di.core "pkg:IFace" token convention.

/** Token for the singleton {@link ILoggerFactory} registered by `addLogging`. */
export const LOGGER_FACTORY_TOKEN = "@rhombus-std/logging:ILoggerFactory";

/**
 * Token each {@link ILoggerProvider} registered via `addProvider` binds to.
 * Registered as an ENUMERABLE (repeated `addValue` under one token), so a future
 * provider-aware `LoggerFactory` registration can resolve the full set — the
 * di.core analog of the reference `IEnumerable<ILoggerProvider>` injection.
 */
export const LOGGER_PROVIDER_TOKEN = "@rhombus-std/logging:ILoggerProvider";
