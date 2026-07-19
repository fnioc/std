// White-box tests for the internal helpers — the control-character sanitizer,
// the timestamp token formatter, and the ANSI escape-code tables — via the
// library's `internal/*` subpath (docs §7/§40).

import { ConsoleColor, DEFAULT_BACKGROUND_COLOR, DEFAULT_FOREGROUND_COLOR, getBackgroundColorEscapeCode,
  getForegroundColorEscapeCode } from '@rhombus-std/logging.console/private/ConsoleColor';
import { ConsoleControlCharacterSanitizer } from '@rhombus-std/logging.console/private/ConsoleControlCharacterSanitizer';
import { formatTimestamp } from '@rhombus-std/logging.console/private/date-format';
import { StringWriter } from '@rhombus-std/logging.console/private/text-writer';
import { TextWriterExtensions } from '@rhombus-std/logging.console/private/TextWriterExtensions';
import { expect, test } from 'bun:test';

// --- sanitizer ---

test('sanitize escapes C0, DEL, and C1 but preserves tab/newline/CR', () => {
  expect(ConsoleControlCharacterSanitizer.sanitize('a\x00b\x1bc\x7fd\x9fe')).toBe(
    'a\\u0000b\\u001Bc\\u007Fd\\u009Fe',
  );
  expect(ConsoleControlCharacterSanitizer.sanitize('keep\tthese\nthree\rintact')).toBe(
    'keep\tthese\nthree\rintact',
  );
});

test('sanitize passes clean strings, empty strings, and undefined through', () => {
  expect(ConsoleControlCharacterSanitizer.sanitize('plain')).toBe('plain');
  expect(ConsoleControlCharacterSanitizer.sanitize('')).toBe('');
  expect(ConsoleControlCharacterSanitizer.sanitize(undefined)).toBeUndefined();
});

// --- timestamp formatting ---

test('formatTimestamp renders the supported tokens (UTC)', () => {
  const date = new Date(Date.UTC(2026, 6, 10, 13, 5, 9, 42));
  expect(formatTimestamp(date, 'yyyy-MM-dd HH:mm:ss.fff', true)).toBe('2026-07-10 13:05:09.042');
  expect(formatTimestamp(date, 'hh tt', true)).toBe('01 PM');
  expect(formatTimestamp(date, 'zzz', true)).toBe('+00:00');
});

test('formatTimestamp passes non-token characters through', () => {
  const date = new Date(Date.UTC(2026, 0, 2, 0, 30, 0, 500));
  expect(formatTimestamp(date, '[dd/MM] f', true)).toBe('[02/01] 5');
  expect(formatTimestamp(date, 'hh tt', true)).toBe('12 AM');
});

// --- ANSI escape codes ---

test('foreground codes: dark colors are plain, bright colors carry the bold prefix', () => {
  expect(getForegroundColorEscapeCode(ConsoleColor.DarkGreen)).toBe('\x1b[32m');
  expect(getForegroundColorEscapeCode(ConsoleColor.Green)).toBe('\x1b[1m\x1b[32m');
  expect(getForegroundColorEscapeCode(ConsoleColor.DarkGray)).toBe(DEFAULT_FOREGROUND_COLOR);
});

test('background codes: only the 8 base colors have codes', () => {
  expect(getBackgroundColorEscapeCode(ConsoleColor.Black)).toBe('\x1b[40m');
  expect(getBackgroundColorEscapeCode(ConsoleColor.White)).toBe(DEFAULT_BACKGROUND_COLOR);
});

test('writeColoredMessage wraps with set/reset pairs and skips absent colors', () => {
  const both = new StringWriter();
  TextWriterExtensions.writeColoredMessage(both, 'msg', ConsoleColor.Black, ConsoleColor.Yellow);
  expect(both.toString()).toBe(
    `\x1b[40m\x1b[1m\x1b[33mmsg${DEFAULT_FOREGROUND_COLOR}${DEFAULT_BACKGROUND_COLOR}`,
  );

  const none = new StringWriter();
  TextWriterExtensions.writeColoredMessage(none, 'msg', undefined, undefined);
  expect(none.toString()).toBe('msg');
});
