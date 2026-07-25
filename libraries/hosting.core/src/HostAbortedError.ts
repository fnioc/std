/**
 * Thrown when an {@link IHost} is stopped to indicate the host is stopping
 * gracefully. Not intended to be thrown or handled by user code.
 */
export class HostAbortedError extends Error {
  /**
   * @param innerError Set as the resulting error's `cause`.
   */
  public constructor(message?: string, innerError?: Error) {
    super(message ?? 'The host was aborted.', innerError ? { cause: innerError } : undefined);
    this.name = 'HostAbortedError';
  }
}
