// White-box formatter tests — reach the internal built-in formatters through
// the library's `internal/*` subpath (lowered per-file JS; docs §7/§40).

import { AnsiLogConsole } from '@rhombus-std/logging.console/_/AnsiLogConsole';
import { ConsoleFormatterOptions } from '@rhombus-std/logging.console/_/ConsoleFormatterOptions';
import { JsonConsoleFormatter } from '@rhombus-std/logging.console/_/JsonConsoleFormatter';
import { JsonConsoleFormatterOptions } from '@rhombus-std/logging.console/_/JsonConsoleFormatterOptions';
import { LoggerColorBehavior } from '@rhombus-std/logging.console/_/LoggerColorBehavior';
import { ReloadableOptions } from '@rhombus-std/logging.console/_/ReloadableOptions';
import { SimpleConsoleFormatter } from '@rhombus-std/logging.console/_/SimpleConsoleFormatter';
import { SimpleConsoleFormatterOptions } from '@rhombus-std/logging.console/_/SimpleConsoleFormatterOptions';
import { SystemdConsoleFormatter } from '@rhombus-std/logging.console/_/SystemdConsoleFormatter';
import { StringWriter } from '@rhombus-std/logging.console/_/text-writer';
import type { LogEntry } from '@rhombus-std/logging.core';
import { EventId, type IExternalScopeProvider } from '@rhombus-std/logging.core';
import { LogLevel } from '@rhombus-std/logging.core';
import { Options } from '@rhombus-std/options';
import { expect, test } from 'bun:test';

function entry(overrides?: Partial<LogEntry<string>>): LogEntry<string> {
  return {
    logLevel: LogLevel.Information,
    category: 'Test.Category',
    eventId: new EventId(10),
    state: 'Request received',
    error: undefined,
    formatter: (state) => state,
    ...overrides,
  };
}

/** A minimal scope stack implementing IExternalScopeProvider. */
function scopeProviderWith(...scopes: unknown[]): IExternalScopeProvider {
  return {
    forEachScope<TState>(callback: (scope: unknown, state: TState) => void, state: TState): void {
      for (const scope of scopes) {
        callback(scope, state);
      }
    },
    push(): Disposable {
      return { [Symbol.dispose]: () => {} };
    },
  };
}

// --- simple ---

test('simple: default multi-line format', () => {
  const formatter = new SimpleConsoleFormatter(Options.of(new SimpleConsoleFormatterOptions()));
  const writer = new StringWriter();

  formatter.write(entry(), undefined, writer);

  expect(writer.toString()).toBe('info: Test.Category[10]\n      Request received\n');
});

test('simple: level strings cover every writable level', () => {
  const formatter = new SimpleConsoleFormatter(Options.of(new SimpleConsoleFormatterOptions()));
  const cases: [LogLevel, string][] = [
    [LogLevel.Trace, 'trce'],
    [LogLevel.Debug, 'dbug'],
    [LogLevel.Information, 'info'],
    [LogLevel.Warning, 'warn'],
    [LogLevel.Error, 'fail'],
    [LogLevel.Critical, 'crit'],
  ];
  for (const [logLevel, label] of cases) {
    const writer = new StringWriter();
    formatter.write(entry({ logLevel }), undefined, writer);
    expect(writer.toString().startsWith(`${label}: `)).toBeTrue();
  }
});

test('simple: multi-line message is padded per line', () => {
  const formatter = new SimpleConsoleFormatter(Options.of(new SimpleConsoleFormatterOptions()));
  const writer = new StringWriter();

  formatter.write(entry({ state: 'line one\nline two' }), undefined, writer);

  expect(writer.toString()).toBe('info: Test.Category[10]\n      line one\n      line two\n');
});

test('simple: singleLine collapses newlines and appends the error', () => {
  const options = new SimpleConsoleFormatterOptions();
  options.singleLine = true;
  const formatter = new SimpleConsoleFormatter(Options.of(options));
  const writer = new StringWriter();
  const error = new Error('boom');
  error.stack = 'Error: boom\n    at somewhere';

  formatter.write(entry({ state: 'a\nb', error }), undefined, writer);

  expect(writer.toString()).toBe('info: Test.Category[10] a b Error: boom     at somewhere\n');
});

test('simple: error renders after the message, padded', () => {
  const formatter = new SimpleConsoleFormatter(Options.of(new SimpleConsoleFormatterOptions()));
  const writer = new StringWriter();
  const error = new Error('boom');
  error.stack = 'Error: boom\n    at somewhere';

  formatter.write(entry({ error }), undefined, writer);

  expect(writer.toString()).toBe(
    'info: Test.Category[10]\n      Request received\n      Error: boom\n          at somewhere\n',
  );
});

test('simple: timestamp prefix honors the format and UTC flag', () => {
  const options = new SimpleConsoleFormatterOptions();
  options.timestampFormat = 'yyyy-MM-dd ';
  options.useUtcTimestamp = true;
  const formatter = new SimpleConsoleFormatter(Options.of(options));
  const writer = new StringWriter();

  formatter.write(entry(), undefined, writer);

  expect(writer.toString()).toMatch(/^\d{4}-\d{2}-\d{2} info: /);
});

test('simple: colorBehavior Enabled embeds ANSI codes; Disabled does not', () => {
  const colored = new SimpleConsoleFormatterOptions();
  colored.colorBehavior = LoggerColorBehavior.Enabled;
  const coloredWriter = new StringWriter();
  new SimpleConsoleFormatter(Options.of(colored)).write(entry(), undefined, coloredWriter);
  // info → dark green foreground on black background.
  expect(coloredWriter.toString()).toBe(
    '\x1b[40m\x1b[32minfo\x1b[39m\x1b[22m\x1b[49m: Test.Category[10]\n      Request received\n',
  );

  const plain = new SimpleConsoleFormatterOptions();
  plain.colorBehavior = LoggerColorBehavior.Disabled;
  const plainWriter = new StringWriter();
  new SimpleConsoleFormatter(Options.of(plain)).write(entry(), undefined, plainWriter);
  expect(plainWriter.toString()).not.toContain('\x1b[');
});

test('simple: includeScopes renders the scope chain', () => {
  const options = new SimpleConsoleFormatterOptions();
  options.includeScopes = true;
  const formatter = new SimpleConsoleFormatter(Options.of(options));
  const writer = new StringWriter();

  formatter.write(entry(), scopeProviderWith('outer', 'inner'), writer);

  expect(writer.toString()).toBe(
    'info: Test.Category[10]\n      => outer => inner\n      Request received\n',
  );
});

test('simple: control characters in message and category are escaped', () => {
  const formatter = new SimpleConsoleFormatter(Options.of(new SimpleConsoleFormatterOptions()));
  const writer = new StringWriter();

  formatter.write(entry({ state: 'danger\x1b[31m', category: 'Cat\x07egory' }), undefined, writer);

  expect(writer.toString()).toBe('info: Cat\\u0007egory[10]\n      danger\\u001B[31m\n');
});

test('simple: options reload swaps the live options', () => {
  const reloadable = new ReloadableOptions(new SimpleConsoleFormatterOptions());
  const formatter = new SimpleConsoleFormatter(reloadable);

  reloadable.reload((options) => {
    options.singleLine = true;
  });

  const writer = new StringWriter();
  formatter.write(entry(), undefined, writer);
  expect(writer.toString()).toBe('info: Test.Category[10] Request received\n');
});

// --- systemd ---

test('systemd: single-line <pri> format', () => {
  const formatter = new SystemdConsoleFormatter(Options.of(new ConsoleFormatterOptions()));
  const writer = new StringWriter();

  formatter.write(entry({ state: 'multi\nline' }), undefined, writer);

  expect(writer.toString()).toBe('<6>Test.Category[10] multi line\n');
});

test('systemd: syslog severities per level', () => {
  const formatter = new SystemdConsoleFormatter(Options.of(new ConsoleFormatterOptions()));
  const cases: [LogLevel, string][] = [
    [LogLevel.Trace, '<7>'],
    [LogLevel.Debug, '<7>'],
    [LogLevel.Information, '<6>'],
    [LogLevel.Warning, '<4>'],
    [LogLevel.Error, '<3>'],
    [LogLevel.Critical, '<2>'],
  ];
  for (const [logLevel, priority] of cases) {
    const writer = new StringWriter();
    formatter.write(entry({ logLevel }), undefined, writer);
    expect(writer.toString().startsWith(priority)).toBeTrue();
  }
});

test('systemd: scopes and error stay on the one line', () => {
  const options = new ConsoleFormatterOptions();
  options.includeScopes = true;
  const formatter = new SystemdConsoleFormatter(Options.of(options));
  const writer = new StringWriter();
  const error = new Error('boom');
  error.stack = 'Error: boom\n    at somewhere';

  formatter.write(entry({ error }), scopeProviderWith('outer'), writer);

  expect(writer.toString()).toBe(
    '<6>Test.Category[10] => outer Request received Error: boom     at somewhere\n',
  );
});

// --- json ---

test('json: compact single-line JSON with the reference property order', () => {
  const formatter = new JsonConsoleFormatter(Options.of(new JsonConsoleFormatterOptions()));
  const writer = new StringWriter();

  formatter.write(entry(), undefined, writer);

  const output = writer.toString();
  expect(output.endsWith('\n')).toBeTrue();
  expect(JSON.parse(output)).toEqual({
    EventId: 10,
    LogLevel: 'Information',
    Category: 'Test.Category',
    Message: 'Request received',
    State: {},
  });
  expect(Object.keys(JSON.parse(output))).toEqual([
    'EventId',
    'LogLevel',
    'Category',
    'Message',
    'State',
  ]);
});

test('json: state key/value pairs and differing state message are written', () => {
  const formatter = new JsonConsoleFormatter(Options.of(new JsonConsoleFormatterOptions()));
  const writer = new StringWriter();
  const state: [string, unknown][] = [['User', 'ada'], ['Attempts', 3], ['Sticky', true], ['Extra', { a: 1 }]];

  formatter.write(
    entry({
      state: state as never,
      formatter: () => 'rendered message',
    }),
    undefined,
    writer,
  );

  const parsed = JSON.parse(writer.toString()) as { State: Record<string, unknown>; };
  expect(parsed.State['User']).toBe('ada');
  expect(parsed.State['Attempts']).toBe(3);
  expect(parsed.State['Sticky']).toBe(true);
  // Non-primitive values render as their string form.
  expect(parsed.State['Extra']).toBe('[object Object]');
  // The state's own string form differs from the rendered message, so it is written.
  expect(parsed.State['Message']).toBe(String(state));
});

test('json: error and scopes are included', () => {
  const options = new JsonConsoleFormatterOptions();
  options.includeScopes = true;
  const formatter = new JsonConsoleFormatter(Options.of(options));
  const writer = new StringWriter();
  const error = new Error('boom');
  error.stack = 'Error: boom\n    at somewhere';

  formatter.write(
    entry({ error }),
    scopeProviderWith('plain scope', [['RequestId', 'r-1']]),
    writer,
  );

  const parsed = JSON.parse(writer.toString()) as { Error: string; Scopes: unknown[]; };
  expect(parsed.Error).toBe('Error: boom\n    at somewhere');
  expect(parsed.Scopes).toEqual([
    'plain scope',
    { Message: 'RequestId,r-1', RequestId: 'r-1' },
  ]);
});

test('json: indented output honors the writer options', () => {
  const options = new JsonConsoleFormatterOptions();
  options.jsonWriterOptions = { indented: true, indentSize: 4 };
  const formatter = new JsonConsoleFormatter(Options.of(options));
  const writer = new StringWriter();

  formatter.write(entry(), undefined, writer);

  expect(writer.toString()).toContain('\n    "EventId": 10');
});

// --- AnsiLogConsole smoke (import keeps the internal surface covered) ---

test('AnsiLogConsole is constructible for stdout and stderr', () => {
  expect(new AnsiLogConsole()).toBeDefined();
  expect(new AnsiLogConsole(true)).toBeDefined();
});
