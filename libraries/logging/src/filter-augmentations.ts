// Reverse-direction dual-export (docs §28) for the LoggerFilterOptions augmentation.
// The concrete value object LoggerFilterOptions lives in THIS package (./logger-filter-options),
// so both the declaration merge onto the class AND the runtime install live here (the
// cross-package rule points the install at wherever the concrete class lives, §28).
//
// #105 resolved the deferred boundary call in favour of giving options-bag receivers
// the method form: ME ships `AddFilter` as a `this LoggerFilterOptions` extension
// method (in FilterLoggingBuilderExtensions, alongside the ILoggingBuilder overloads),
// so the receiver reads `options.addFilter(...)` just like every other dual-export
// member. The `LoggerFilterOptionsExtensions` object literal ships from ./filter-extensions.

import type { LogLevel } from "@rhombus-std/logging.core";
import { applyAugmentations } from "@rhombus-std/primitives";
import type { Func } from "@rhombus-toolkit/func";
import { LoggerFilterOptionsExtensions } from "./filter-extensions";
import { LoggerFilterOptions } from "./logger-filter-options";

declare module "./logger-filter-options" {
  interface LoggerFilterOptions {
    addFilter(category: string | undefined, level: LogLevel): this;
    addFilter(filter: Func<[string | undefined, string | undefined, LogLevel], boolean>): this;
  }
}

applyAugmentations(LoggerFilterOptions, LoggerFilterOptionsExtensions);
