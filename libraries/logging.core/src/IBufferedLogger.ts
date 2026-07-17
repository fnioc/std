// Buffered logging — the batch-delivery capability, ported from
// ME.Logging.Abstractions' `IBufferedLogger` + `BufferedLogRecord`.
//
// A logging provider always implements `ILogger`; it MAY additionally implement
// `IBufferedLogger` to signal that it can accept a batch of already-captured log
// records at once. When buffering is enabled, the log producer type-tests the
// provider for this interface and, if present, delivers records through
// `logRecords` instead of one-at-a-time `ILogger.log` calls.

import type { EventId } from './EventId';
import type { LogLevel } from './LogLevel';

/**
 * A single buffered log record, delivered in batch to an {@link IBufferedLogger}.
 *
 * Instances may be pooled and reused, so an {@link IBufferedLogger.logRecords}
 * implementation must not retain a record (or the state it references) past the
 * call that delivered it. Only {@link timestamp}, {@link logLevel}, and
 * {@link eventId} are required; the rest default to absent and a subclass
 * overrides the ones it can supply.
 */
export abstract class BufferedLogRecord {
  /** The time the record was first created. */
  public abstract get timestamp(): Date;

  /** The record's logging severity. */
  public abstract get logLevel(): LogLevel;

  /** The record's event id. */
  public abstract get eventId(): EventId;

  /** An error string for this record, if any. */
  public get error(): string | undefined {
    return undefined;
  }

  /**
   * The activity span id of the thread that created the record, if any. A plain
   * hex string here — the reference `ActivitySpanId` has no analog in this port
   * (the tracing/`Activity` runtime is intentionally unported).
   */
  public get activitySpanId(): string | undefined {
    return undefined;
  }

  /**
   * The activity trace id of the thread that created the record, if any. A plain
   * hex string here, for the same reason as {@link activitySpanId}.
   */
  public get activityTraceId(): string | undefined {
    return undefined;
  }

  /** The id of the thread that created the record, if any. */
  public get managedThreadId(): number | undefined {
    return undefined;
  }

  /** The formatted (rendered) log message, if any. */
  public get formattedMessage(): string | undefined {
    return undefined;
  }

  /** The original log message template, if any. */
  public get messageTemplate(): string | undefined {
    return undefined;
  }

  /**
   * The variable set of name/value pairs associated with the record. Defaults to
   * empty; the reference `IReadOnlyList<KeyValuePair<string, object?>>` shape is
   * a readonly array of `[name, value]` tuples.
   */
  public get attributes(): readonly (readonly [string, unknown])[] {
    return [];
  }
}

/**
 * A logging provider that supports buffered logging. A provider implements this
 * beside {@link ILogger}; the log producer delivers a batch through
 * {@link logRecords} when buffering is enabled.
 */
export interface IBufferedLogger {
  /**
   * Delivers a batch of buffered log records. Once this returns, the
   * implementation must no longer access the records or their state — the
   * instances may be reused for other logs.
   */
  logRecords(records: Iterable<BufferedLogRecord>): void;
}
