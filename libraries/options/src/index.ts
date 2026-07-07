// Public entry point for @rhombus-std/options -- the collapsed Options<T>
// accessor (see docs/decisions.md §4.2) and the OptionsFactory pipeline
// (§4.5).
//
// The DI-builder registration augmentation (`addOptions`/`configure`) is NOT
// ported here -- see the README.

export { Options } from "./options.js";

export type { ConfigureOptions } from "./configure-options.js";
export { OptionsFactory } from "./options-factory.js";
export { OptionsValidationError } from "./options-validation-error.js";
export type { PostConfigureOptions } from "./post-configure-options.js";
export { ValidateOptionsResult } from "./validate-options-result.js";
export type { ValidateOptions } from "./validate-options.js";
