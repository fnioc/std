// ConfigureOptions<T> -- a configure step, ported from MEO's
// IConfigureOptions<T> (the `I` prefix is dropped to match this family's
// naming, e.g. Options<T>).
//
// No name parameter: named options are distinct registrations in this repo
// (docs/decisions.md §4.2), so a step is never asked to configure "a named
// instance" -- it always configures the one instance it was registered for.

/**
 * Represents something that configures an options object of type `T`. The
 * first stage of the {@link OptionsFactory} pipeline: configure steps run in
 * registration order to compose the value from its sources (code defaults,
 * overrides, and -- via `@rhombus-std/options.augmentations` -- config bind).
 */
export interface ConfigureOptions<T> {
  /**
   * Applies this step's contribution to `options`, mutating it in place.
   *
   * @param options The options instance being built.
   */
  configure(options: T): void;
}
