// IStartupValidator -- ported from the reference Options project's
// IStartupValidator: the host-facing seam that forces eager validation of the
// options marked for startup validation (see StartupValidator and the
// `validateOnStart` augmentation in @rhombus-std/options.augmentations).
//
// The reference splits this into IStartupValidator (sync) and
// IAsyncStartupValidator (async). This port keeps only the SYNC surface: the
// options pipeline (OptionsFactory) here is synchronous and there is no
// `IAsyncValidateOptions` analog, so an async startup-validator would have
// nothing to run -- YAGNI, stated so it is not later "restored."

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
