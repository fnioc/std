// IBufferedLogger + BufferedLogRecord — the batch-delivery capability. A
// concrete record supplies the three required members and inherits the optional
// defaults unless it overrides them; a buffered logger receives a batch.

import { BufferedLogRecord, EventId, type IBufferedLogger, LogLevel } from '@rhombus-std/logging.core';
import { describe, expect, test } from 'bun:test';

/** A minimal record: only the three required members, everything else defaulted. */
class MinimalRecord extends BufferedLogRecord {
  public override get timestamp(): Date {
    return new Date(0);
  }
  public override get logLevel(): LogLevel {
    return LogLevel.Information;
  }
  public override get eventId(): EventId {
    return new EventId(7, 'started');
  }
}

/** A fuller record that overrides some of the optional members. */
class RichRecord extends BufferedLogRecord {
  public override get timestamp(): Date {
    return new Date(1000);
  }
  public override get logLevel(): LogLevel {
    return LogLevel.Warning;
  }
  public override get eventId(): EventId {
    return new EventId(9);
  }
  public override get formattedMessage(): string | undefined {
    return 'disk almost full';
  }
  public override get messageTemplate(): string | undefined {
    return 'disk almost full';
  }
  public override get attributes(): ReadonlyArray<readonly [string, unknown]> {
    return [['Free', 12]];
  }
}

describe('BufferedLogRecord', () => {
  test('exposes the required members and defaults the optional ones to absent/empty', () => {
    const record = new MinimalRecord();
    expect(record.timestamp).toEqual(new Date(0));
    expect(record.logLevel).toBe(LogLevel.Information);
    expect(record.eventId.id).toBe(7);

    expect(record.error).toBeUndefined();
    expect(record.activitySpanId).toBeUndefined();
    expect(record.activityTraceId).toBeUndefined();
    expect(record.managedThreadId).toBeUndefined();
    expect(record.formattedMessage).toBeUndefined();
    expect(record.messageTemplate).toBeUndefined();
    expect(record.attributes).toEqual([]);
  });

  test('a subclass can override the optional members', () => {
    const record = new RichRecord();
    expect(record.formattedMessage).toBe('disk almost full');
    expect(record.attributes).toEqual([['Free', 12]]);
  });
});

describe('IBufferedLogger', () => {
  test('receives a batch of records', () => {
    const delivered: BufferedLogRecord[] = [];
    const logger: IBufferedLogger = {
      logRecords(records: Iterable<BufferedLogRecord>): void {
        for (const record of records) {
          delivered.push(record);
        }
      },
    };

    logger.logRecords([new MinimalRecord(), new RichRecord()]);

    expect(delivered).toHaveLength(2);
    expect(delivered[0]?.logLevel).toBe(LogLevel.Information);
    expect(delivered[1]?.logLevel).toBe(LogLevel.Warning);
  });
});
