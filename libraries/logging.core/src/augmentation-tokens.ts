// The augmentation-registry token for logging.core's OPEN augmentation-target
// receiver, `ILoggingBuilder` (docs/decisions.md §38). This string keys the
// primitives augmentation registry's bag for the logging-builder receiver, so
// every extender — `logging` (addProvider/setMinimumLevel/clearProviders),
// `logging.configuration` (addConfiguration), the `logging.console` console sink
// (addConsole) — registers its augmentation set against the same token, and the
// concrete `LoggingBuilder` decorated with it pulls them onto its prototype.
//
// The value is a plain `nameof`-format string (`<package>:<TypeName>`); the
// transformer's `nameof<ILoggingBuilder>()` derives the identical literal. The
// `Token` type is re-exported by `@rhombus-std/di.core` (logging.core's only
// dependency), which sources it from the primitives leaf.

import type { Token } from "@rhombus-std/di.core";

/** Registry token for the `ILoggingBuilder` augmentation receiver. */
export const LOGGING_BUILDER_AUGMENTATION_TOKEN: Token = "@rhombus-std/logging.core:ILoggingBuilder";
