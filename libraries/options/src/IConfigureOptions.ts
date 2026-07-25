/**
 * Represents something that configures an options object of type `T`. The
 * first stage of the {@link OptionsFactory} pipeline: configure steps run in
 * registration order to compose the value from its sources (code defaults,
 * overrides, and -- via `@rhombus-std/options.augmentations` -- config bind).
 */
export interface IConfigureOptions<T> {
  /**
   * Applies this step's contribution to `options`, mutating it in place.
   *
   * @param options The options instance being built.
   */
  configure(options: T): void;
}
