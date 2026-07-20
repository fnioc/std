// JsonConsoleFormatter — one JSON object per log line, ported from the
// reference internal `JsonConsoleFormatter`. Internal: not exported from the
// package barrel; consumers select it by name ("json").
//
// Serialization adapts the reference's streaming JSON writer to
// `JSON.stringify` over an insertion-ordered plain object; property names and
// ordering match the reference output (`Timestamp?`, `EventId`, `LogLevel`,
// `Category`, `Message`, `Error?`, `State?`, `Scopes?`) -- `Error?` renamed
// from the reference's `Exception?` per this port's error-naming convention.
// One further divergence: the reference writer can emit DUPLICATE keys inside
// `State` (its fixed `Message` plus a state property also named "Message"); a
// JS object cannot, so the state property wins (last write). The
// `BufferedLogRecord` fast path is NOT ported (see SimpleConsoleFormatter).

import type { IExternalScopeProvider, LogEntry } from '@rhombus-std/logging.core';
import { LogLevel } from '@rhombus-std/logging.core';
import type { IOptions } from '@rhombus-std/options';
import { assertNever } from '@rhombus-toolkit/type-guards';
import { ConsoleFormatter } from './ConsoleFormatter';
import { ConsoleFormatterNames } from './ConsoleFormatterNames';
import { formatTimestamp } from './date-format';
import type { JsonConsoleFormatterOptions } from './JsonConsoleFormatterOptions';
import type { TextWriter } from './text-writer';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue; };

function getLogLevelString(logLevel: LogLevel): string {
  switch (logLevel) {
    case LogLevel.Trace: {
      return 'Trace';
    }
    case LogLevel.Debug: {
      return 'Debug';
    }
    case LogLevel.Information: {
      return 'Information';
    }
    case LogLevel.Warning: {
      return 'Warning';
    }
    case LogLevel.Error: {
      return 'Error';
    }
    case LogLevel.Critical: {
      return 'Critical';
    }
    case LogLevel.None: {
      throw new RangeError(`Invalid log level: ${logLevel}.`);
    }
    default: {
      assertNever(logLevel);
    }
  }
}

/**
 * The reference `WriteItem` value mapping: JSON-native values pass through,
 * everything else renders as its invariant string.
 */
function toJsonValue(value: unknown): JsonValue {
  switch (typeof value) {
    case 'boolean':
    case 'string': {
      return value;
    }
    case 'number': {
      // JSON has no NaN/Infinity; stringify would silently emit null — do it explicitly.
      return Number.isFinite(value) ? value : String(value);
    }
    case 'undefined': {
      return null;
    }
    default: {
      return value === null ? null : String(value);
    }
  }
}

/**
 * The analog of the reference's `state as IReadOnlyList<KeyValuePair<string,
 * object?>>` probe: an iterable of `[key, value]` pairs (an array of tuples, a
 * `Map`, …) yields its entries; anything else yields `undefined`.
 */
function asKeyValuePairs(value: unknown): Array<[string, unknown]> | undefined {
  if (value === null || typeof value !== 'object' || !(Symbol.iterator in value)) {
    return undefined;
  }
  const pairs: Array<[string, unknown]> = [];
  for (const item of value as Iterable<unknown>) {
    if (!Array.isArray(item) || item.length !== 2 || typeof item[0] !== 'string') {
      return undefined;
    }
    pairs.push([item[0], item[1]]);
  }
  return pairs;
}

/** Writes each entry as a single-line JSON object. */
export class JsonConsoleFormatter extends ConsoleFormatter implements Disposable {
  readonly #optionsReloadToken: Disposable | undefined;

  /** The live options — reassigned on reload (internal, as upstream). */
  public formatterOptions: JsonConsoleFormatterOptions;

  public constructor(options: IOptions<JsonConsoleFormatterOptions>) {
    super(ConsoleFormatterNames.json);
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

    const entry: { [key: string]: JsonValue; } = {};

    const timestampFormat = this.formatterOptions.timestampFormat;
    if (timestampFormat !== undefined) {
      entry['Timestamp'] = formatTimestamp(new Date(), timestampFormat, this.formatterOptions.useUtcTimestamp);
    }
    entry['EventId'] = logEntry.eventId.id;
    entry['LogLevel'] = getLogLevelString(logEntry.logLevel);
    entry['Category'] = logEntry.category;
    entry['Message'] = message;

    if (logEntry.error !== undefined) {
      entry['Error'] = logEntry.error.stack ?? String(logEntry.error);
    }

    const state: unknown = logEntry.state;
    if (state !== undefined && state !== null) {
      const stateObject: { [key: string]: JsonValue; } = {};
      // The message and state message are often identical; only write the
      // state message when it differs (reduces the entry size, as upstream).
      const stateMessage = String(state);
      if (stateMessage !== message) {
        stateObject['Message'] = stateMessage;
      }
      const stateProperties = asKeyValuePairs(state);
      if (stateProperties !== undefined) {
        for (const [key, value] of stateProperties) {
          stateObject[key] = toJsonValue(value);
        }
      }
      entry['State'] = stateObject;
    }

    const scopes = this.#collectScopes(scopeProvider);
    if (scopes !== undefined) {
      entry['Scopes'] = scopes;
    }

    const writerOptions = this.formatterOptions.jsonWriterOptions;
    const space = writerOptions.indented === true
      ? (writerOptions.indentCharacter ?? ' ').repeat(writerOptions.indentSize ?? 2)
      : undefined;
    textWriter.write(JSON.stringify(entry, undefined, space));
    textWriter.write('\n');
  }

  #collectScopes(scopeProvider: IExternalScopeProvider | undefined): JsonValue[] | undefined {
    if (!this.formatterOptions.includeScopes || scopeProvider === undefined) {
      return undefined;
    }
    const scopes: JsonValue[] = [];
    scopeProvider.forEachScope((scope, state) => {
      const scopeItems = asKeyValuePairs(scope);
      if (scopeItems !== undefined) {
        const scopeObject: { [key: string]: JsonValue; } = { Message: String(scope) };
        for (const [key, value] of scopeItems) {
          scopeObject[key] = toJsonValue(value);
        }
        state.push(scopeObject);
      } else {
        state.push(scope === undefined || scope === null ? null : String(scope));
      }
    }, scopes);
    return scopes;
  }
}
