/**
 * Thrown when an {@link IHost} is stopped to indicate the host is stopping
 * gracefully. Not intended to be thrown or handled by user code.
 */
export class HostAbortedException extends Error {
  public constructor(message?: string) {
    super(message ?? "The host was aborted.");
    this.name = "HostAbortedException";
  }
}
