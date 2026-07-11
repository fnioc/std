// White-box queue-processor and logger tests — reach the internals through the
// library's `internal/*` subpath (lowered per-file JS; docs §7/§40).

import { ConsoleLogger } from "@rhombus-std/logging.console/internal/console-logger";
import { ConsoleLoggerOptions } from "@rhombus-std/logging.console/internal/ConsoleLoggerOptions";
import {
  ConsoleLoggerProcessor,
  droppedMessagesWarning,
} from "@rhombus-std/logging.console/internal/ConsoleLoggerProcessor";
import { ConsoleLoggerQueueFullMode } from "@rhombus-std/logging.console/internal/ConsoleLoggerQueueFullMode";
import type { IConsole } from "@rhombus-std/logging.console/internal/IConsole";
import { SimpleConsoleFormatter } from "@rhombus-std/logging.console/internal/SimpleConsoleFormatter";
import { SimpleConsoleFormatterOptions } from "@rhombus-std/logging.console/internal/SimpleConsoleFormatterOptions";
import { EventId, LogLevel } from "@rhombus-std/logging.core";
import { Options } from "@rhombus-std/options";
import { expect, test } from "bun:test";

class FakeConsole implements IConsole {
  public readonly writes: string[] = [];
  public throwOnWrite = false;

  public write(message: string): void {
    if (this.throwOnWrite) {
      throw new Error("console unavailable");
    }
    this.writes.push(message);
  }
}

function processor(fullMode = ConsoleLoggerQueueFullMode.Wait, maxQueueLength = 1024): {
  processor: ConsoleLoggerProcessor;
  out: FakeConsole;
  err: FakeConsole;
} {
  const out = new FakeConsole();
  const err = new FakeConsole();
  return { processor: new ConsoleLoggerProcessor(out, err, fullMode, maxQueueLength), out, err };
}

/** Lets the microtask-scheduled drain run. */
async function drained(): Promise<void> {
  await Promise.resolve();
}

test("writes are queued, then drained asynchronously in order", async () => {
  const { processor: queue, out } = processor();

  queue.enqueueMessage({ message: "first\n", logAsError: false });
  queue.enqueueMessage({ message: "second\n", logAsError: false });
  expect(out.writes).toEqual([]);

  await drained();
  expect(out.writes).toEqual(["first\n", "second\n"]);
});

test("logAsError routes to the error console", async () => {
  const { processor: queue, out, err } = processor();

  queue.enqueueMessage({ message: "ok\n", logAsError: false });
  queue.enqueueMessage({ message: "bad\n", logAsError: true });
  await drained();

  expect(out.writes).toEqual(["ok\n"]);
  expect(err.writes).toEqual(["bad\n"]);
});

test("DropWrite drops past the limit and prepends a warning on the next enqueue", async () => {
  const { processor: queue, err } = processor(ConsoleLoggerQueueFullMode.DropWrite, 2);

  // Fill the queue (drain has not run yet), then overflow it twice.
  queue.enqueueMessage({ message: "1\n", logAsError: false });
  queue.enqueueMessage({ message: "2\n", logAsError: false });
  queue.enqueueMessage({ message: "dropped\n", logAsError: false });
  queue.enqueueMessage({ message: "dropped\n", logAsError: false });
  await drained();
  // Queue has room again — the next message carries the warning first.
  queue.enqueueMessage({ message: "3\n", logAsError: false });
  await drained();

  expect(err.writes).toEqual([droppedMessagesWarning(2)]);
});

test("Wait mode admits messages past the limit (no loss)", async () => {
  const { processor: queue, out } = processor(ConsoleLoggerQueueFullMode.Wait, 1);

  queue.enqueueMessage({ message: "1\n", logAsError: false });
  queue.enqueueMessage({ message: "2\n", logAsError: false });
  queue.enqueueMessage({ message: "3\n", logAsError: false });
  await drained();

  expect(out.writes).toEqual(["1\n", "2\n", "3\n"]);
});

test("dispose flushes everything still queued, synchronously", () => {
  const { processor: queue, out } = processor();

  queue.enqueueMessage({ message: "pending\n", logAsError: false });
  queue[Symbol.dispose]();

  expect(out.writes).toEqual(["pending\n"]);
});

test("after dispose, messages write inline instead of queueing", () => {
  const { processor: queue, out } = processor();

  queue[Symbol.dispose]();
  queue.enqueueMessage({ message: "late\n", logAsError: false });

  expect(out.writes).toEqual(["late\n"]);
});

test("a write failure completes the queue", async () => {
  const { processor: queue, out } = processor();

  out.throwOnWrite = true;
  queue.enqueueMessage({ message: "boom\n", logAsError: false });
  await drained();

  out.throwOnWrite = false;
  // Enqueue now fails → the message writes inline immediately.
  queue.enqueueMessage({ message: "inline\n", logAsError: false });
  expect(out.writes).toEqual(["inline\n"]);
});

test("constructor and setters validate their inputs", () => {
  const out = new FakeConsole();
  expect(() => new ConsoleLoggerProcessor(out, out, ConsoleLoggerQueueFullMode.Wait, 0)).toThrow(RangeError);
  expect(() => new ConsoleLoggerProcessor(out, out, 99 as ConsoleLoggerQueueFullMode, 1)).toThrow(RangeError);

  const { processor: queue } = processor();
  expect(() => {
    queue.maxQueueLength = -1;
  }).toThrow(RangeError);
  expect(() => {
    queue.fullMode = 99 as ConsoleLoggerQueueFullMode;
  }).toThrow(RangeError);
});

// --- ConsoleLogger through the queue ---

function consoleLogger(options?: ConsoleLoggerOptions): { logger: ConsoleLogger; out: FakeConsole; err: FakeConsole } {
  const { processor: queue, out, err } = processor();
  const formatter = new SimpleConsoleFormatter(Options.of(new SimpleConsoleFormatterOptions()));
  const logger = new ConsoleLogger("Test.Category", queue, formatter, undefined, options ?? new ConsoleLoggerOptions());
  return { logger, out, err };
}

test("ConsoleLogger renders through its formatter and queues the write", async () => {
  const { logger, out } = consoleLogger();

  logger.log(LogLevel.Information, new EventId(10), "hello", undefined, (state) => state);
  await drained();

  expect(out.writes).toEqual(["info: Test.Category[10]\n      hello\n"]);
});

test("ConsoleLogger routes levels at/above logToStandardErrorThreshold to stderr", async () => {
  const options = new ConsoleLoggerOptions();
  options.logToStandardErrorThreshold = LogLevel.Error;
  const { logger, out, err } = consoleLogger(options);

  logger.log(LogLevel.Warning, new EventId(1), "warned", undefined, (state) => state);
  logger.log(LogLevel.Error, new EventId(2), "failed", undefined, (state) => state);
  await drained();

  expect(out.writes).toEqual(["warn: Test.Category[1]\n      warned\n"]);
  expect(err.writes).toEqual(["fail: Test.Category[2]\n      failed\n"]);
});

test("ConsoleLogger: every level except None is enabled; None writes nothing", async () => {
  const { logger, out, err } = consoleLogger();

  expect(logger.isEnabled(LogLevel.Trace)).toBeTrue();
  expect(logger.isEnabled(LogLevel.None)).toBeFalse();

  logger.log(LogLevel.None, new EventId(0), "never", undefined, (state) => state);
  await drained();
  expect(out.writes).toEqual([]);
  expect(err.writes).toEqual([]);
});

test("ConsoleLogger.beginScope is undefined without a scope provider", () => {
  const { logger } = consoleLogger();
  expect(logger.beginScope("scope")).toBeUndefined();
});
