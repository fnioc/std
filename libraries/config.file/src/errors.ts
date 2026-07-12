// The two error types the file-configuration base and the file parsers raise.
//
// `FormatError` is the shared "the file's contents don't parse" error every
// file-format provider throws from its `loadContent` (JSON root not an
// object, INI line without `=`, XML namespace, a duplicate resolved key, ...).
// `InvalidDataError` is the file base's wrapper: when a provider's
// `loadContent` throws, the base rethrows it wrapped in `InvalidDataError`
// (carrying the original as `cause`) so the failure carries the file path and
// routes through the `onLoadError` handler uniformly. Named `*Error`, not
// `*Exception`, per the repo's error-not-exception convention.

/** Thrown by a file-format parser when a file's contents are malformed. */
export class FormatError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'FormatError';
  }
}

/**
 * Wraps an error thrown by a concrete provider's `loadContent`. Carries the
 * underlying parse/format failure as {@link cause}.
 */
export class InvalidDataError extends Error {
  public constructor(message: string, options?: { cause?: unknown; }) {
    super(message, options);
    this.name = 'InvalidDataError';
  }
}
