// Public entry point for @rhombus-std/options -- the collapsed Options<T>
// accessor (see docs/decisions.md §4.2).
//
// The DI-builder registration augmentation (`addOptions`/`configure`) and
// the configure/validate/OptionsFactory pipeline are NOT ported here -- see
// the README.

export { Options } from "./options.js";
