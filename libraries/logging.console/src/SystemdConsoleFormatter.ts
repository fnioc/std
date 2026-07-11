// SystemdConsoleFormatter — the systemd-journal "<pri>message" format, ported
// from the reference internal `SystemdConsoleFormatter`. Internal: not
// exported from the package barrel; consumers select it by name ("systemd").
//
// systemd reads messages from standard out line-by-line in a `<pri>message`
// format; newline characters are treated as message delimiters, so they are
// replaced. Example:
//
//   <6>ConsoleApp.Program[10] Request received
//
// The `BufferedLogRecord` fast path is NOT ported (see SimpleConsoleFormatter).

import type { IExternalScopeProvider, LogEntry } from "@rhombus-std/logging.core";
import { LogLevel } from "@rhombus-std/logging.core";
import type { Options } from "@rhombus-std/options";
import { assertNever } from "@rhombus-toolkit/type-guards";
import { ConsoleControlCharacterSanitizer } from "./ConsoleControlCharacterSanitizer";
import { ConsoleFormatter } from "./ConsoleFormatter";
import { ConsoleFormatterNames } from "./ConsoleFormatterNames";
import type { ConsoleFormatterOptions } from "./ConsoleFormatterOptions";
import { formatTimestamp } from "./date-format";
import type { TextWriter } from "./text-writer";

/** 'Syslog Message Severities' from RFC 5424. */
function getSyslogSeverityString(logLevel: LogLevel): string {
  switch (logLevel) {
    case LogLevel.Trace:
    case LogLevel.Debug: {
      return "<7>"; // debug-level messages
    }
    case LogLevel.Information: {
      return "<6>"; // informational messages
    }
    case LogLevel.Warning: {
      return "<4>"; // warning conditions
    }
    case LogLevel.Error: {
      return "<3>"; // error conditions
    }
    case LogLevel.Critical: {
      return "<2>"; // critical conditions
    }
    case LogLevel.None: {
      throw new RangeError(`Invalid log level: ${logLevel}.`);
    }
    default: {
      assertNever(logLevel);
    }
  }
}

/** Writes the reference systemd-journal console format. */
export class SystemdConsoleFormatter extends ConsoleFormatter implements Disposable {
  readonly #optionsReloadToken: Disposable | undefined;

  /** The live options — reassigned on reload (internal, as upstream). */
  public formatterOptions: ConsoleFormatterOptions;

  public constructor(options: Options<ConsoleFormatterOptions>) {
    super(ConsoleFormatterNames.systemd);
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
      logEntry.category,
      logEntry.eventId.id,
      logEntry.error === undefined ? undefined : logEntry.error.stack ?? String(logEntry.error),
      this.#getCurrentDateTime(),
    );
  }

  #writeInternal(
    scopeProvider: IExternalScopeProvider | undefined,
    textWriter: TextWriter,
    message: string,
    logLevel: LogLevel,
    category: string,
    eventId: number,
    exception: string | undefined,
    stamp: Date | undefined,
  ): void {
    message = ConsoleControlCharacterSanitizer.sanitize(message);
    exception = ConsoleControlCharacterSanitizer.sanitize(exception);
    category = ConsoleControlCharacterSanitizer.sanitize(category);

    // loglevel
    textWriter.write(getSyslogSeverityString(logLevel));

    // timestamp
    const timestampFormat = this.formatterOptions.timestampFormat;
    if (timestampFormat !== undefined && stamp !== undefined) {
      textWriter.write(formatTimestamp(stamp, timestampFormat, this.formatterOptions.useUtcTimestamp));
    }

    // category and event id
    textWriter.write(category);
    textWriter.write("[");
    textWriter.write(String(eventId));
    textWriter.write("]");

    // scope information
    this.#writeScopeInformation(textWriter, scopeProvider);

    // message
    if (message !== "") {
      textWriter.write(" ");
      textWriter.write(message.replaceAll("\n", " "));
    }

    // exception, single-line
    if (exception !== undefined) {
      textWriter.write(" ");
      textWriter.write(exception.replaceAll("\n", " "));
    }

    // newline delimiter
    textWriter.write("\n");
  }

  #getCurrentDateTime(): Date | undefined {
    return this.formatterOptions.timestampFormat !== undefined ? new Date() : undefined;
  }

  #writeScopeInformation(textWriter: TextWriter, scopeProvider: IExternalScopeProvider | undefined): void {
    if (!this.formatterOptions.includeScopes || scopeProvider === undefined) {
      return;
    }
    scopeProvider.forEachScope((scope, state) => {
      state.write(" => ");
      state.write(ConsoleControlCharacterSanitizer.sanitize(String(scope)));
    }, textWriter);
  }
}
