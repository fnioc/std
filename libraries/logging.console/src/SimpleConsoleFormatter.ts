// SimpleConsoleFormatter — the default "simple" console format, ported from
// the reference internal `SimpleConsoleFormatter`. Internal: not exported from
// the package barrel; consumers select it by name ("simple").
//
//       info: ConsoleApp.Program[10]
//             Request received
//
// The reference's `IOptionsMonitor<TOptions>` constructor parameter is the
// repo's collapsed `Options<TOptions>` (subscribe-capable when reloadable).
// The `BufferedLogRecord` fast path is NOT ported — `IBufferedLogger` /
// `BufferedLogRecord` don't exist in @rhombus-std/logging.core yet (residual,
// see the package index). The Android/mobile color suppression is skipped: a
// platform condition with no analog here.

import type { IExternalScopeProvider } from "@rhombus-std/logging.core";
import { LogLevel } from "@rhombus-std/logging.core";
import type { Options } from "@rhombus-std/options";
import { assertNever } from "@rhombus-toolkit/type-guards";
import { ConsoleColor } from "./AnsiParser";
import { ConsoleControlCharacterSanitizer } from "./ConsoleControlCharacterSanitizer";
import { ConsoleFormatter } from "./ConsoleFormatter";
import { ConsoleFormatterNames } from "./ConsoleFormatterNames";
import { emitAnsiColorCodes } from "./ConsoleUtils";
import { formatTimestamp } from "./date-format";
import type { LogEntry } from "./LogEntry";
import { LoggerColorBehavior } from "./LoggerColorBehavior";
import type { SimpleConsoleFormatterOptions } from "./SimpleConsoleFormatterOptions";
import type { TextWriter } from "./text-writer";
import { TextWriterExtensions } from "./TextWriterExtensions";

const LOGLEVEL_PADDING = ": ";
/** Width of `info: ` — every level string is 4 characters. */
const MESSAGE_PADDING = " ".repeat(4 + LOGLEVEL_PADDING.length);
const NEWLINE_WITH_MESSAGE_PADDING = `\n${MESSAGE_PADDING}`;

interface ConsoleColors {
  readonly foreground: ConsoleColor | undefined;
  readonly background: ConsoleColor | undefined;
}

const NO_COLORS: ConsoleColors = { foreground: undefined, background: undefined };

function getLogLevelString(logLevel: LogLevel): string {
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
    case LogLevel.None: {
      // A valid enum member that must never reach the formatter — isEnabled
      // filters it before log() gets here.
      throw new RangeError(`Invalid log level: ${logLevel}.`);
    }
    default: {
      assertNever(logLevel);
    }
  }
}

/** Writes the reference "simple" console format (optionally colored/single-line). */
export class SimpleConsoleFormatter extends ConsoleFormatter implements Disposable {
  readonly #optionsReloadToken: Disposable | undefined;

  /** The live options — reassigned on reload (internal, as upstream). */
  public formatterOptions: SimpleConsoleFormatterOptions;

  public constructor(options: Options<SimpleConsoleFormatterOptions>) {
    super(ConsoleFormatterNames.simple);
    this.formatterOptions = options.value;
    this.#optionsReloadToken = options.subscribe?.((reloaded) => {
      this.formatterOptions = reloaded;
    });
  }

  public [Symbol.dispose](): void {
    this.#optionsReloadToken?.[Symbol.dispose]();
  }

  public override write<TState>(
    logEntry: LogEntry<TState>,
    scopeProvider: IExternalScopeProvider | undefined,
    textWriter: TextWriter,
  ): void {
    const message = logEntry.formatter(logEntry.state, logEntry.error);
    this.#writeInternal(
      scopeProvider,
      textWriter,
      message,
      logEntry.logLevel,
      logEntry.eventId.id,
      logEntry.error === undefined ? undefined : logEntry.error.stack ?? String(logEntry.error),
      logEntry.category,
      this.#getCurrentDateTime(),
    );
  }

  #writeInternal(
    scopeProvider: IExternalScopeProvider | undefined,
    textWriter: TextWriter,
    message: string,
    logLevel: LogLevel,
    eventId: number,
    exception: string | undefined,
    category: string,
    stamp: Date | undefined,
  ): void {
    message = ConsoleControlCharacterSanitizer.sanitize(message);
    exception = ConsoleControlCharacterSanitizer.sanitize(exception);
    category = ConsoleControlCharacterSanitizer.sanitize(category);

    const logLevelColors = this.#getLogLevelConsoleColors(logLevel);
    const logLevelString = getLogLevelString(logLevel);

    const timestampFormat = this.formatterOptions.timestampFormat;
    if (timestampFormat !== undefined && stamp !== undefined) {
      textWriter.write(formatTimestamp(stamp, timestampFormat, this.formatterOptions.useUtcTimestamp));
    }
    TextWriterExtensions.writeColoredMessage(
      textWriter,
      logLevelString,
      logLevelColors.background,
      logLevelColors.foreground,
    );

    const singleLine = this.formatterOptions.singleLine;

    // Example:
    // info: ConsoleApp.Program[10]
    //       Request received

    // category and event id
    textWriter.write(LOGLEVEL_PADDING);
    textWriter.write(category);
    textWriter.write("[");
    textWriter.write(String(eventId));
    textWriter.write("]");
    if (!singleLine) {
      textWriter.write("\n");
    }

    // scope information
    this.#writeScopeInformation(textWriter, scopeProvider, singleLine);
    SimpleConsoleFormatter.#writeMessage(textWriter, message, singleLine);

    // Example:
    // Error: something failed
    //    at fn (file:line)
    if (exception !== undefined) {
      SimpleConsoleFormatter.#writeMessage(textWriter, exception, singleLine);
    }
    if (singleLine) {
      textWriter.write("\n");
    }
  }

  static #writeMessage(textWriter: TextWriter, message: string, singleLine: boolean): void {
    if (message === "") {
      return;
    }
    if (singleLine) {
      textWriter.write(" ");
      textWriter.write(message.replaceAll("\n", " "));
    } else {
      textWriter.write(MESSAGE_PADDING);
      textWriter.write(message.replaceAll("\n", NEWLINE_WITH_MESSAGE_PADDING));
      textWriter.write("\n");
    }
  }

  #getCurrentDateTime(): Date | undefined {
    return this.formatterOptions.timestampFormat !== undefined ? new Date() : undefined;
  }

  #getLogLevelConsoleColors(logLevel: LogLevel): ConsoleColors {
    const behavior = this.formatterOptions.colorBehavior;
    const disableColors = behavior === LoggerColorBehavior.Disabled
      || (behavior === LoggerColorBehavior.Default && !emitAnsiColorCodes());
    if (disableColors) {
      return NO_COLORS;
    }
    // We must explicitly set the background color if we are setting the
    // foreground color, since just setting one can look bad on the user's console.
    switch (logLevel) {
      case LogLevel.Trace:
      case LogLevel.Debug: {
        return { foreground: ConsoleColor.Gray, background: ConsoleColor.Black };
      }
      case LogLevel.Information: {
        return { foreground: ConsoleColor.DarkGreen, background: ConsoleColor.Black };
      }
      case LogLevel.Warning: {
        return { foreground: ConsoleColor.Yellow, background: ConsoleColor.Black };
      }
      case LogLevel.Error: {
        return { foreground: ConsoleColor.Black, background: ConsoleColor.DarkRed };
      }
      case LogLevel.Critical: {
        return { foreground: ConsoleColor.White, background: ConsoleColor.DarkRed };
      }
      default: {
        return NO_COLORS;
      }
    }
  }

  #writeScopeInformation(
    textWriter: TextWriter,
    scopeProvider: IExternalScopeProvider | undefined,
    singleLine: boolean,
  ): void {
    if (!this.formatterOptions.includeScopes || scopeProvider === undefined) {
      return;
    }
    let paddingNeeded = !singleLine;
    scopeProvider.forEachScope((scope, state) => {
      if (paddingNeeded) {
        paddingNeeded = false;
        state.write(MESSAGE_PADDING);
        state.write("=> ");
      } else {
        state.write(" => ");
      }
      state.write(ConsoleControlCharacterSanitizer.sanitize(String(scope)));
    }, textWriter);

    if (!paddingNeeded && !singleLine) {
      textWriter.write("\n");
    }
  }
}
