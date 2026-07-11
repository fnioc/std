// ConsoleLoggerProcessor — the background message-queue writer, ported from
// the reference internal `ConsoleLoggerProcessor` with its dedicated writer
// THREAD adapted to an async queue. Internal: not exported from the package
// barrel.
//
// Write-path semantics kept faithful:
//   - `enqueueMessage` → `enqueue`; when the queue has completed adding, the
//     message is written synchronously inline instead (same fallback).
//   - A write failure completes the queue (subsequent messages write inline).
//   - `DropWrite` drops new messages at the limit and, on the next successful
//     enqueue, prepends a warning naming the dropped count.
//   - Dispose flushes: the reference joins its writer thread (with timeout);
//     here dispose drains the queue synchronously — nothing pending is lost.
//
// The thread adaptation: the drain runs as a microtask (`Promise.resolve`
// scheduling — available in the bare §44 program, unlike `queueMicrotask`),
// so messages rendered in one synchronous burst are written in one later
// drain, exactly the decoupling the reference thread provides. `Wait` mode
// cannot block the producer — blocking the only thread would also block the
// drain — so it admits messages past the limit (no-loss preserved); see
// ConsoleLoggerQueueFullMode.
//
import { ConsoleLoggerQueueFullMode } from "./ConsoleLoggerQueueFullMode";
import type { IConsole } from "./IConsole";
import type { LogMessageEntry } from "./LogMessageEntry";

/** The warning written when `DropWrite` has dropped messages. */
export function droppedMessagesWarning(count: number): string {
  return `${count} message(s) dropped because of queue size limit. Increase the queue size or `
    + "decrease logging verbosity to avoid this. You may change `ConsoleLoggerQueueFullMode` "
    + "to stop dropping messages.\n";
}

/** The async queue between logger `log(...)` calls and console writes. */
export class ConsoleLoggerProcessor implements Disposable {
  readonly #messageQueue: LogMessageEntry[] = [];
  #messagesDropped = 0;
  #isAddingCompleted = false;
  #drainScheduled = false;

  #maxQueueLength: number;
  #fullMode: ConsoleLoggerQueueFullMode;

  /** The console standard-out messages are written to. */
  public readonly console: IConsole;

  /** The console error-routed messages ({@link LogMessageEntry.logAsError}) are written to. */
  public readonly errorConsole: IConsole;

  public constructor(
    console: IConsole,
    errorConsole: IConsole,
    fullMode: ConsoleLoggerQueueFullMode,
    maxQueueLength: number,
  ) {
    this.console = console;
    this.errorConsole = errorConsole;
    this.#fullMode = ConsoleLoggerProcessor.#validateFullMode(fullMode);
    this.#maxQueueLength = ConsoleLoggerProcessor.#validateMaxQueueLength(maxQueueLength);
  }

  static #validateFullMode(value: ConsoleLoggerQueueFullMode): ConsoleLoggerQueueFullMode {
    if (value !== ConsoleLoggerQueueFullMode.Wait && value !== ConsoleLoggerQueueFullMode.DropWrite) {
      throw new RangeError(`${value} is not a supported queue mode value.`);
    }
    return value;
  }

  static #validateMaxQueueLength(value: number): number {
    if (value <= 0) {
      throw new RangeError(`maxQueueLength must be larger than zero, was ${value}.`);
    }
    return value;
  }

  public get maxQueueLength(): number {
    return this.#maxQueueLength;
  }

  public set maxQueueLength(value: number) {
    this.#maxQueueLength = ConsoleLoggerProcessor.#validateMaxQueueLength(value);
  }

  public get fullMode(): ConsoleLoggerQueueFullMode {
    return this.#fullMode;
  }

  public set fullMode(value: ConsoleLoggerQueueFullMode) {
    this.#fullMode = ConsoleLoggerProcessor.#validateFullMode(value);
  }

  /** Queues `message` for writing — or writes it inline once adding has completed. */
  public enqueueMessage(message: LogMessageEntry): void {
    if (!this.#enqueue(message)) {
      this.writeMessage(message);
    }
  }

  /** Writes one entry to its routed console; a failure completes the queue. */
  public writeMessage(entry: LogMessageEntry): void {
    try {
      const console = entry.logAsError ? this.errorConsole : this.console;
      console.write(entry.message);
    } catch {
      this.#completeAdding();
    }
  }

  #enqueue(item: LogMessageEntry): boolean {
    if (this.#isAddingCompleted) {
      return false;
    }

    if (
      this.#messageQueue.length >= this.#maxQueueLength
      && this.#fullMode === ConsoleLoggerQueueFullMode.DropWrite
    ) {
      this.#messagesDropped += 1;
      return true;
    }

    if (this.#messagesDropped > 0) {
      // The warning precedes the new item — the drops happened before it.
      this.#messageQueue.push({
        message: droppedMessagesWarning(this.#messagesDropped),
        logAsError: true,
      });
      this.#messagesDropped = 0;
    }
    this.#messageQueue.push(item);
    this.#scheduleDrain();
    return true;
  }

  #scheduleDrain(): void {
    if (this.#drainScheduled) {
      return;
    }
    this.#drainScheduled = true;
    void Promise.resolve().then(() => {
      this.#drainScheduled = false;
      this.#drain();
    });
  }

  #drain(): void {
    let entry = this.#messageQueue.shift();
    while (entry !== undefined) {
      this.writeMessage(entry);
      entry = this.#messageQueue.shift();
    }
  }

  #completeAdding(): void {
    this.#isAddingCompleted = true;
  }

  /** Completes adding and flushes everything still queued, synchronously. */
  public [Symbol.dispose](): void {
    this.#completeAdding();
    this.#drain();
  }
}
