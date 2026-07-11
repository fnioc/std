/**
 * Thrown when an {@link IHost} is stopped to indicate the host is stopping
 * gracefully. Not intended to be thrown or handled by user code.
 */
export class HostAbortedError extends Error {
  /**
   * Constructs the error, collapsing the reference's three ctors (`()`,
   * `(message)`, `(message, innerError)`) into one. `innerError` maps to
   * the JS `Error` `cause` — the platform's analog of a wrapped inner error.
   */
  public constructor(message?: string, innerError?: Error) {
    super(message ?? 'The host was aborted.', innerError ? { cause: innerError } : undefined);
    this.name = 'HostAbortedError';
  }
}
