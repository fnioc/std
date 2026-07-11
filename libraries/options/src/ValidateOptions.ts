// ValidateOptions<T> -- a validate step, ported from MEO's
// IValidateOptions<T> (I prefix dropped, name parameter dropped -- see
// configure-options.ts).

import type { ValidateOptionsResult } from './ValidateOptionsResult.js';

/**
 * Represents something that validates a fully-configured options object of
 * type `T`. The final stage of the {@link OptionsFactory} pipeline: every
 * validate step runs against the post-configured value, and any failures are
 * aggregated into a single thrown {@link OptionsValidationError}.
 */
export interface ValidateOptions<T> {
  /**
   * Validates `options`.
   *
   * @param options The fully-configured options instance.
   * @returns Success, skip, or a failure carrying one or more messages -- see
   * {@link ValidateOptionsResult}.
   */
  validate(options: T): ValidateOptionsResult;
}
