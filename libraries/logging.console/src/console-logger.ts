// ConsoleLogger — a minimal port of the reference console provider's logger,
// writing the simple console format to stdout.
//
// The reference logger delegates rendering to a pluggable formatter registry
// (simple/systemd/json) and hands the rendered entry to a background queue
// writer. Both are OUT OF SCOPE this pass: this logger renders the simple
// format inline and writes synchronously to `process.stdout`. The layout
// mirrors the reference simple format:
//
//       info: ConsoleApp.Program[10]
//             Request received
//
// i.e. `<level>: <category>[<eventId>]`, then the message on its own
// padded line (padding = the width of `<level>: `).

import type { EventId, ILogger } from "@rhombus-std/logging.core";
import { LogLevel } from "@rhombus-std/logging.core";
import type { Func } from "@rhombus-toolkit/func";

/**
 * The four-character level names of the reference simple console format.
 * Deterministic width keeps the message padding aligned across levels.
 */
function logLevelString(logLevel: LogLevel): string {
  switch (logLevel) {
    case LogLevel.Trace: {
      return "trce";
    }
    case LogLevel.Debug: {
      return "dbug";
    }
    case LogLevel.Information: {
      return "info";
    }
    case LogLevel.Warning: {
      return "warn";
    }
    case LogLevel.Error: {
      return "fail";
    }
    case LogLevel.Critical: {
      return "crit";
    }
    default: {
      throw new RangeError(`Invalid log level: ${logLevel}.`);
    }
  }
}

/** Message-line padding: the width of a `<level>: ` prefix (4 + 2). */
const MESSAGE_PADDING = "      ";

/** An {@link ILogger} that writes the simple console format to stdout. */
export class ConsoleLogger implements ILogger {
  private readonly category: string;

  public constructor(category: string) {
    this.category = category;
  }

  public log<TState>(
    logLevel: LogLevel,
    eventId: EventId,
    state: TState,
    error: Error | undefined,
    formatter: Func<[TState, Error | undefined], string>,
  ): void {
    if (!this.isEnabled(logLevel)) {
      return;
    }

    let entry = `${logLevelString(logLevel)}: ${this.category}[${eventId.id}]\n`
      + `${MESSAGE_PADDING}${formatter(state, error)}\n`;
    if (error !== undefined) {
      // The reference appends the exception on its own line after the message.
      entry += `${MESSAGE_PADDING}${error.stack ?? String(error)}\n`;
    }
    process.stdout.write(entry);
  }

  /** Every level is enabled except {@link LogLevel.None}; filtering belongs to the factory. */
  public isEnabled(logLevel: LogLevel): boolean {
    return logLevel !== LogLevel.None;
  }

  /** Scopes are unsupported this pass (no external scope provider yet). */
  public beginScope<TState>(_state: TState): Disposable | undefined {
    return undefined;
  }
}
