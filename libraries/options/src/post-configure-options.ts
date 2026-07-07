// PostConfigureOptions<T> -- a post-configure step, ported from MEO's
// IPostConfigureOptions<T> (I prefix dropped, name parameter dropped -- see
// configure-options.ts).

/**
 * Represents something that runs *after* all {@link ConfigureOptions} steps.
 * The guaranteed-last-word pass of the {@link OptionsFactory} pipeline: a
 * library or framework gets to see and adjust the fully-configured value
 * before it is validated and returned.
 */
export interface PostConfigureOptions<T> {
  /**
   * Applies this step's contribution to the already-configured `options`,
   * mutating it in place.
   *
   * @param options The options instance, after every configure step has run.
   */
  postConfigure(options: T): void;
}
