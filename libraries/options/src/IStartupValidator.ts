/**
 * Used by hosts to validate options during startup. A host resolves this
 * (optionally -- it is registered only when `validateOnStart` was called for at
 * least one options token) and invokes {@link validate} before starting its
 * hosted services, so misconfiguration fails fast at boot rather than on first
 * use of the options.
 */
export interface IStartupValidator {
  /**
   * Forces eager evaluation of every options registration marked for startup
   * validation, running its validate steps now.
   *
   * @throws {OptionsValidationError} A single marked registration fails
   * validation -- rethrown as-is.
   * @throws {AggregateError} More than one fails; each failure is an
   * `OptionsValidationError` in `AggregateError.errors`.
   */
  validate(): void;
}
