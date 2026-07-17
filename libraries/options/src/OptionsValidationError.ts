// OptionsValidationError -- ported from MEO's OptionsValidationException.
//
// Aggregates the failures collected across every IValidateOptions step of a
// single OptionsFactory.create() into one thrown error. MEO's exception also
// carries the options name and CLR type; the name is dropped (named options
// are distinct registrations here, §4.2) and there is no cheap runtime type
// token in TS, so this carries the failure list only. `message` mirrors MEO
// by joining the failures with "; ".

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
