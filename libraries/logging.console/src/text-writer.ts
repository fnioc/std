// TextWriter — the write sink a console formatter renders into, plus the
// in-memory StringWriter the ConsoleLogger uses to capture a formatter's
// output before enqueueing it.
//
// Deliberately minimal: exactly the one member formatters call, so any object
// with a string `write` method satisfies it.

/** A character sink a {@link ConsoleFormatter} writes rendered output into. */
export interface TextWriter {
  /** Appends `value` to the writer's output. */
  write(value: string): void;
}

/** An in-memory {@link TextWriter} that accumulates into a string. */
export class StringWriter implements TextWriter {
  #buffer = '';

  public write(value: string): void {
    this.#buffer += value;
  }

  /** The accumulated output. */
  public toString(): string {
    return this.#buffer;
  }

  /** The accumulated length — used to detect an empty rendering. */
  public get length(): number {
    return this.#buffer.length;
  }

  /** Resets the writer for reuse. */
  public clear(): void {
    this.#buffer = '';
  }
}
