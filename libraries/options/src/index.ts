// Public entry point for @rhombus-std/options -- the collapsed IOptions<T>
// accessor (see docs/decisions.md §4.2) and the OptionsFactory pipeline
// (§4.5).
//
// The DI-builder registration augmentation (`addOptions`/`configure`) is NOT
// ported here -- see the README.

export { Options } from './IOptions.js';
export type { IOptions } from './IOptions.js';

export type { IConfigureOptions } from './IConfigureOptions.js';
export type { IPostConfigureOptions } from './IPostConfigureOptions.js';
export type { IStartupValidator } from './IStartupValidator.js';
export type { IValidateOptions } from './IValidateOptions.js';
export { OptionsFactory } from './OptionsFactory.js';
export { OptionsValidationError } from './OptionsValidationError.js';
export { StartupValidator } from './StartupValidator.js';
export { ValidateOptionsResult } from './ValidateOptionsResult.js';
export { ValidateOptionsResultBuilder } from './ValidateOptionsResultBuilder.js';
