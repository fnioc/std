// FileLoadErrorContext -- the value handed to a builder-wide load-error
// handler (`setFileLoadErrorHandler`) when a file provider's load throws.
// Mirrors the reference `FileLoadExceptionContext`, renamed to `*ErrorContext`
// per the error-not-exception convention; the `error` field is likewise the
// renamed `Exception` member.

import type { FileConfigurationProvider } from './FileConfigurationProvider';

/** Contains information about a file load error. */
export interface FileLoadErrorContext {
  /** The provider whose load raised the error. */
  provider: FileConfigurationProvider;
  /** The error that occurred during load. */
  error: unknown;
  /**
   * When set to `true` by the handler, the error is swallowed rather than
   * rethrown. Defaults to `false` (rethrow).
   */
  ignore: boolean;
}
