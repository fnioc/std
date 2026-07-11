/**
 * Thrown when an {@link IHost} is stopped to indicate the host is stopping
 * gracefully. Not intended to be thrown or handled by user code.
 */
export class HostAbortedException extends Error {
  /**
   * Constructs the exception, collapsing the reference's three ctors (`()`,
   * `(message)`, `(message, innerException)`) into one. `innerException` maps to
   * the JS `Error` `cause` — the platform's analog of a wrapped inner exception.
   */
  public constructor(message?: string, innerException?: Error) {
    super(message ?? 'The host was aborted.', innerException ? { cause: innerException } : undefined);
    this.name = 'HostAbortedException';
  }
}
