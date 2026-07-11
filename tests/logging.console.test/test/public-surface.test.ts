// Black-box tests — exercise only @rhombus-std/logging.console's public
// surface (the barrel), plus @rhombus-std/logging's LoggingBuilder for the
// registry-installed method forms.

import type { ServiceManifest, Token } from '@rhombus-std/di.core';
import { LOGGER_PROVIDER_TOKEN, LoggingBuilder } from '@rhombus-std/logging';
import { ConsoleFormatter, ConsoleFormatterNames, ConsoleLoggerExtensions, ConsoleLoggerFormat, ConsoleLoggerOptions,
  ConsoleLoggerProvider, ConsoleLoggerQueueFullMode, type LogEntry, StringWriter,
  type TextWriter } from '@rhombus-std/logging.console';
import { EventId, type IExternalScopeProvider, type ILoggingBuilder, LogLevel } from '@rhombus-std/logging.core';
import { Options } from '@rhombus-std/options';
import { expect, test } from 'bun:test';

/** A recording stand-in for the di.core registration builder. */
function fakeServices(): { services: ServiceManifest; values: [Token, unknown][]; } {
  const values: [Token, unknown][] = [];
  const services = {
    addValue(token: Token, value: unknown): void {
      values.push([token, value]);
    },
  } as unknown as ServiceManifest;
  return { services, values };
}

function builderOver(services: ServiceManifest): ILoggingBuilder {
  return new LoggingBuilder(services);
}

/** A trivial custom formatter capturing what it was asked to write. */
class UpperFormatter extends ConsoleFormatter {
  public constructor() {
    super('upper');
  }

  public override write<TState>(
    logEntry: LogEntry<TState>,
    _scopeProvider: IExternalScopeProvider | undefined,
    textWriter: TextWriter,
  ): void {
    textWriter.write(`${logEntry.formatter(logEntry.state, logEntry.error).toUpperCase()}\n`);
  }
}

// --- ConsoleLoggerOptions ---

test('ConsoleLoggerOptions defaults mirror the reference', () => {
  const options = new ConsoleLoggerOptions();
  expect(options.formatterName).toBeUndefined();
  expect(options.logToStandardErrorThreshold).toBe(LogLevel.None);
  expect(options.queueFullMode).toBe(ConsoleLoggerQueueFullMode.Wait);
  expect(options.maxQueueLength).toBe(2500);
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  expect(options.format).toBe(ConsoleLoggerFormat.Default);
});

test('ConsoleLoggerOptions validates queueFullMode, maxQueueLength, and format', () => {
  const options = new ConsoleLoggerOptions();
  expect(() => {
    options.maxQueueLength = 0;
  }).toThrow(RangeError);
  expect(() => {
    options.queueFullMode = 99 as ConsoleLoggerQueueFullMode;
  }).toThrow(RangeError);
  expect(() => {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    options.format = 99 as ConsoleLoggerFormat;
  }).toThrow(RangeError);
});

// --- ConsoleLoggerProvider ---

test('provider caches one logger per category', () => {
  using provider = new ConsoleLoggerProvider();
  const a = provider.createLogger('Cat');
  const b = provider.createLogger('Cat');
  const c = provider.createLogger('Other');
  expect(a).toBe(b);
  expect(a).not.toBe(c);
});

test('provider resolves the formatter by name, case-insensitively', async () => {
  const options = new ConsoleLoggerOptions();
  options.formatterName = 'UPPER';
  using provider = new ConsoleLoggerProvider(Options.of(options), [new UpperFormatter()]);
  const logger = provider.createLogger('Cat');

  const writes: string[] = [];
  const stdout = process.stdout as unknown as { write(chunk: string): boolean; };
  const originalWrite = stdout.write.bind(stdout);
  stdout.write = (chunk: string) => {
    writes.push(chunk);
    return true;
  };
  try {
    logger.log(LogLevel.Information, new EventId(1), 'hello', undefined, (state) => state);
    await Promise.resolve();
  } finally {
    stdout.write = originalWrite;
  }

  expect(writes).toEqual(['HELLO\n']);
});

test('provider setScopeProvider reaches existing loggers', () => {
  using provider = new ConsoleLoggerProvider();
  const logger = provider.createLogger('Cat');
  expect(logger.beginScope('s')).toBeUndefined();

  let pushed: unknown;
  provider.setScopeProvider({
    forEachScope(): void {},
    push(state: unknown): Disposable {
      pushed = state;
      return { [Symbol.dispose]: () => {} };
    },
  });

  const scope = logger.beginScope('scoped');
  expect(pushed).toBe('scoped');
  scope?.[Symbol.dispose]();
});

// --- the registration surface ---

test('addConsole registers exactly one provider per manifest', () => {
  const { services, values } = fakeServices();
  const builder = builderOver(services);

  ConsoleLoggerExtensions.addConsole(builder);
  ConsoleLoggerExtensions.addConsole(builder, (options) => {
    options.maxQueueLength = 7;
  });
  ConsoleLoggerExtensions.addSimpleConsole(builder);

  const providers = values.filter(([token]) => token === LOGGER_PROVIDER_TOKEN);
  expect(providers).toHaveLength(1);
  expect(providers[0]?.[1]).toBeInstanceOf(ConsoleLoggerProvider);
});

test('the method forms are installed on LoggingBuilder via the registry', () => {
  const { services } = fakeServices();
  const builder = builderOver(services);

  expect(builder.addConsole()).toBe(builder);
  expect(builder.addSimpleConsole()).toBe(builder);
  expect(builder.addJsonConsole()).toBe(builder);
  expect(builder.addSystemdConsole()).toBe(builder);
  expect(builder.addConsoleFormatter(new UpperFormatter())).toBe(builder);
});

test('configure delegates accumulate onto the shared options and reach the provider', async () => {
  const { services, values } = fakeServices();
  const builder = builderOver(services);
  const writes: string[] = [];

  ConsoleLoggerExtensions.addConsole(builder);
  // A configure applied AFTER the provider exists must still land (the
  // reference OnChange route): select the custom formatter registered late.
  ConsoleLoggerExtensions.addConsoleFormatter(builder, new UpperFormatter());
  ConsoleLoggerExtensions.addConsole(builder, (options) => {
    options.formatterName = 'upper';
  });

  const provider = values[0]?.[1] as ConsoleLoggerProvider;
  const logger = provider.createLogger('Cat');

  // Capture the platform stdout for the queued write.
  const stdout = process.stdout as unknown as { write(chunk: string): boolean; };
  const originalWrite = stdout.write.bind(stdout);
  stdout.write = (chunk: string) => {
    writes.push(chunk);
    return true;
  };
  try {
    logger.log(LogLevel.Information, new EventId(1), 'hello', undefined, (state) => state);
    await Promise.resolve();
  } finally {
    stdout.write = originalWrite;
  }

  expect(writes).toEqual(['HELLO\n']);
  provider[Symbol.dispose]();
});

test("addSimpleConsole's configure reaches the built-in simple formatter", async () => {
  const { services, values } = fakeServices();
  const builder = builderOver(services);
  const writes: string[] = [];

  ConsoleLoggerExtensions.addSimpleConsole(builder, (options) => {
    options.singleLine = true;
  });

  const provider = values[0]?.[1] as ConsoleLoggerProvider;
  const logger = provider.createLogger('Cat');

  const stdout = process.stdout as unknown as { write(chunk: string): boolean; };
  const originalWrite = stdout.write.bind(stdout);
  stdout.write = (chunk: string) => {
    writes.push(chunk);
    return true;
  };
  const env = process.env as Record<string, string | undefined>;
  const hadNoColor = env['NO_COLOR'];
  env['NO_COLOR'] = '1';
  try {
    logger.log(LogLevel.Information, new EventId(3), 'one line', undefined, (state) => state);
    await Promise.resolve();
  } finally {
    stdout.write = originalWrite;
    if (hadNoColor === undefined) {
      delete env['NO_COLOR'];
    } else {
      env['NO_COLOR'] = hadNoColor;
    }
  }

  expect(writes).toEqual(['info: Cat[3] one line\n']);
  provider[Symbol.dispose]();
});

test('ConsoleFormatterNames carries the three reserved names', () => {
  expect(ConsoleFormatterNames.simple).toBe('simple');
  expect(ConsoleFormatterNames.json).toBe('json');
  expect(ConsoleFormatterNames.systemd).toBe('systemd');
});

test('StringWriter accumulates and clears', () => {
  const writer = new StringWriter();
  writer.write('a');
  writer.write('b');
  expect(writer.toString()).toBe('ab');
  expect(writer.length).toBe(2);
  writer.clear();
  expect(writer.length).toBe(0);
});
