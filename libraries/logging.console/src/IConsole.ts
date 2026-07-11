// IConsole — the write-a-string console abstraction the queue processor
// targets, ported from the reference internal `IConsole`. Internal: not
// exported from the package barrel.

/** A console a rendered message can be written to. */
export interface IConsole {
  write(message: string): void;
}
