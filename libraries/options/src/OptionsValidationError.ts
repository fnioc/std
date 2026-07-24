/**
 * Thrown by {@link OptionsFactory} when one or more {@link IValidateOptions}
 * steps fail. Carries the aggregated {@link failures}; the `message` is those
 * failures joined by `"; "`.
 */
export class OptionsValidationError extends Error {
  /** The individual failure messages collected across every validate step. */
  readonly failures: readonly string[];

  constructor(failures: Iterable<string>) {
    const list = [...failures];
    super(list.join('; '));
    this.name = 'OptionsValidationError';
    this.failures = list;
  }
}
