// Internal: not exported from the package barrel.

/** A console a rendered message can be written to. */
export interface IConsole {
  write(message: string): void;
}
