// ValidateOptionsResult -- the outcome of a validate step, ported from MEO's
// ValidateOptionsResult.
//
// Mirrors the reference's three-state shape (succeeded / skipped / failed)
// and its two `fail` overloads: a single message becomes a one-element
// failure list, while a list of messages is joined into the summary
// `failureMessage`. Kept as a small immutable class with static singletons
// (`skip` / `success`) and a `fail` factory, matching MEO exactly.

/**
 * The result of validating an options object -- see {@link IValidateOptions}.
 * One of three states: succeeded, skipped (this validator does not apply),
 * or failed (with one or more failure messages).
 */
export class ValidateOptionsResult {
  /** A shared result indicating the validator was skipped. */
  static readonly skip: ValidateOptionsResult = new ValidateOptionsResult(false, true, undefined);

  /** A shared result indicating validation succeeded. */
  static readonly success: ValidateOptionsResult = new ValidateOptionsResult(true, false, undefined);

  /** `true` if validation succeeded. */
  readonly succeeded: boolean;

  /** `true` if the validator did not apply and was skipped. */
  readonly skipped: boolean;

  /** `true` if validation failed. When `true`, {@link failures} is non-empty. */
  readonly failed: boolean;

  /** A summary of the failures (the messages joined by `"; "`), or `undefined`. */
  readonly failureMessage: string | undefined;

  /** The individual failure messages. Empty unless {@link failed} is `true`. */
  readonly failures: readonly string[];

  private constructor(
    succeeded: boolean,
    skipped: boolean,
    failures: readonly string[] | undefined,
  ) {
    this.succeeded = succeeded;
    this.skipped = skipped;
    this.failed = failures !== undefined;
    this.failures = failures ?? [];
    this.failureMessage = failures !== undefined ? failures.join('; ') : undefined;
  }

  /**
   * A failed result. A single string becomes a one-element failure list; an
   * iterable of strings is captured as-is (with `failureMessage` set to the
   * joined summary).
   *
   * @param failures The failure message, or messages.
   */
  static fail(failures: string | Iterable<string>): ValidateOptionsResult {
    const list = typeof failures === 'string' ? [failures] : [...failures];
    return new ValidateOptionsResult(false, false, list);
  }
}
