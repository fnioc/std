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

/**
 * Token the `Options<LoggerFilterOptions>` assembly is keyed at. The
 * builder-level `addFilter` (./filter-augmentations) appends its configure
 * steps to this token's options-pipeline slots; a consumer materializes the
 * accumulated rule set by registering the assembly for the same token —
 * `services.addOptions(LOGGER_FILTER_OPTIONS_TOKEN, () => new LoggerFilterOptions())`.
 * The reference keys this pipeline by the options TYPE
 * (`Configure<LoggerFilterOptions>`); the "pkg:Type" token is the di.core
 * analog of that type identity.
 */
export const LOGGER_FILTER_OPTIONS_TOKEN = "@rhombus-std/logging:LoggerFilterOptions";
