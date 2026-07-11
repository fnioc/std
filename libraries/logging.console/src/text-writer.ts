// TextWriter — the write sink a console formatter renders into, plus the
// in-memory StringWriter the ConsoleLogger uses to capture a formatter's
// output before enqueueing it.
//
// The reference formatters write to the platform `TextWriter` (a System.IO
// type, not part of the reference logging packages). This platform has no such
// type, so the seam is the minimal structural interface below: exactly the one
// member the formatters call. Any object with a string `write` satisfies it.

/** A character sink a {@link ConsoleFormatter} writes rendered output into. */
export interface TextWriter {
  /** Appends `value` to the writer's output. */
  write(value: string): void;
}

/**
 * An in-memory {@link TextWriter} accumulating into a string — the analog of
 * the reference `StringWriter` the console logger renders each entry through.
 */
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

  /** Resets the writer for reuse (the reference `StringBuilder.Clear`). */
  public clear(): void {
    this.#buffer = '';
  }
}
