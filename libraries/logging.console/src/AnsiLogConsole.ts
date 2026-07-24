import type { ConsoleStream } from './ConsoleStream';
import { stderr, stdout } from './ConsoleStream';
import type { IConsole } from './IConsole';

/** An {@link IConsole} that writes messages (ANSI codes included) to a standard stream. */
export class AnsiLogConsole implements IConsole {
  readonly #stream: ConsoleStream;

  public constructor(stdErr = false) {
    this.#stream = stdErr ? stderr : stdout;
  }

  public write(message: string): void {
    this.#stream.write(message);
  }
}
