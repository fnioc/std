// AnsiLogConsole — an IConsole writing to a standard stream, for consoles that
// understand ANSI escape sequences; ported from the reference internal
// `AnsiLogConsole`. Internal: not exported from the package barrel.
//
// The reference also ships an `AnsiParsingLogConsole` that PARSES the embedded
// ANSI codes back out and replays them through the legacy console color API
// (for consoles that don't understand escape sequences). That type is not
// ported: on this platform ANSI escape sequences ARE the console color
// mechanism — there is no non-ANSI color API to translate to — so the parsing
// console is meaningless here.

import type { ConsoleStream } from "./ConsoleUtils";
import { stderr, stdout } from "./ConsoleUtils";
import type { IConsole } from "./IConsole";

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
