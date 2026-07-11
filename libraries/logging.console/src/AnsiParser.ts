// AnsiParser — the ANSI color escape-code tables, ported from the reference
// internal `AnsiParser`. Internal: not exported from the package barrel.
//
// Only the code-EMITTING half is ported (the color → escape-code getters the
// formatters and TextWriterExtensions consume). The reference's `Parse` half —
// which strips codes back out for its `AnsiParsingLogConsole` — is not: on
// this platform ANSI escape sequences are the native console color mechanism,
// so nothing needs them parsed away (see ./AnsiLogConsole).

import { assertNever } from '@rhombus-toolkit/type-guards';

/**
 * The 16 console colors of the reference platform's console color model. The
 * "dark" names are the ANSI base intensities; the plain names are bright/bold.
 */
export enum ConsoleColor {
  Black = 0,
  DarkBlue = 1,
  DarkGreen = 2,
  DarkCyan = 3,
  DarkRed = 4,
  DarkMagenta = 5,
  DarkYellow = 6,
  Gray = 7,
  DarkGray = 8,
  Blue = 9,
  Green = 10,
  Cyan = 11,
  Red = 12,
  Magenta = 13,
  Yellow = 14,
  White = 15,
}

/** Resets to the default foreground color (and normal intensity). */
export const DEFAULT_FOREGROUND_COLOR = '\x1b[39m\x1b[22m';

/** Resets to the default background color. */
export const DEFAULT_BACKGROUND_COLOR = '\x1b[49m';

/** The ANSI escape sequence selecting `color` as the foreground. */
export function getForegroundColorEscapeCode(color: ConsoleColor): string {
  switch (color) {
    case ConsoleColor.Black: {
      return '\x1b[30m';
    }
    case ConsoleColor.DarkRed: {
      return '\x1b[31m';
    }
    case ConsoleColor.DarkGreen: {
      return '\x1b[32m';
    }
    case ConsoleColor.DarkYellow: {
      return '\x1b[33m';
    }
    case ConsoleColor.DarkBlue: {
      return '\x1b[34m';
    }
    case ConsoleColor.DarkMagenta: {
      return '\x1b[35m';
    }
    case ConsoleColor.DarkCyan: {
      return '\x1b[36m';
    }
    case ConsoleColor.Gray: {
      return '\x1b[37m';
    }
    case ConsoleColor.Red: {
      return '\x1b[1m\x1b[31m';
    }
    case ConsoleColor.Green: {
      return '\x1b[1m\x1b[32m';
    }
    case ConsoleColor.Yellow: {
      return '\x1b[1m\x1b[33m';
    }
    case ConsoleColor.Blue: {
      return '\x1b[1m\x1b[34m';
    }
    case ConsoleColor.Magenta: {
      return '\x1b[1m\x1b[35m';
    }
    case ConsoleColor.Cyan: {
      return '\x1b[1m\x1b[36m';
    }
    case ConsoleColor.White: {
      return '\x1b[1m\x1b[37m';
    }
    case ConsoleColor.DarkGray: {
      // No dedicated code in the reference table either — fall back to default.
      return DEFAULT_FOREGROUND_COLOR;
    }
    default: {
      assertNever(color);
    }
  }
}

/** The ANSI escape sequence selecting `color` as the background. */
export function getBackgroundColorEscapeCode(color: ConsoleColor): string {
  switch (color) {
    case ConsoleColor.Black: {
      return '\x1b[40m';
    }
    case ConsoleColor.DarkRed: {
      return '\x1b[41m';
    }
    case ConsoleColor.DarkGreen: {
      return '\x1b[42m';
    }
    case ConsoleColor.DarkYellow: {
      return '\x1b[43m';
    }
    case ConsoleColor.DarkBlue: {
      return '\x1b[44m';
    }
    case ConsoleColor.DarkMagenta: {
      return '\x1b[45m';
    }
    case ConsoleColor.DarkCyan: {
      return '\x1b[46m';
    }
    case ConsoleColor.Gray: {
      return '\x1b[47m';
    }
    case ConsoleColor.DarkGray:
    case ConsoleColor.Blue:
    case ConsoleColor.Green:
    case ConsoleColor.Cyan:
    case ConsoleColor.Red:
    case ConsoleColor.Magenta:
    case ConsoleColor.Yellow:
    case ConsoleColor.White: {
      // The reference emits only the 8 base background codes; bright
      // backgrounds fall back to the default, exactly as upstream.
      return DEFAULT_BACKGROUND_COLOR;
    }
    default: {
      assertNever(color);
    }
  }
}
