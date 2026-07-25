// FileLoadErrorContext -- the value handed to a builder-wide load-error
// handler (`setFileLoadErrorHandler`) when a file provider's load throws.

import type { FileConfigProvider } from './FileConfigProvider';

/** Contains information about a file load error. */
export interface FileLoadErrorContext {
  /** The provider whose load raised the error. */
  provider: FileConfigProvider;
  /** The error that occurred during load. */
  error: unknown;
  /**
   * When set to `true` by the handler, the error is swallowed rather than
   * rethrown. Defaults to `false` (rethrow).
   */
  ignore: boolean;
}
