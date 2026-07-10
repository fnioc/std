// Public entry point for @rhombus-std/options -- the collapsed Options<T>
// accessor (see docs/decisions.md §4.2) and the OptionsFactory pipeline
// (§4.5).
//
// The DI-builder registration augmentation (`addOptions`/`configure`) is NOT
// ported here -- see the README.

export { Options } from "./options.js";

export type { ConfigureOptions } from "./ConfigureOptions.js";
export { OptionsFactory } from "./OptionsFactory.js";
export { OptionsValidationError } from "./OptionsValidationError.js";
export type { PostConfigureOptions } from "./PostConfigureOptions.js";
export type { ValidateOptions } from "./ValidateOptions.js";
export { ValidateOptionsResult } from "./ValidateOptionsResult.js";
