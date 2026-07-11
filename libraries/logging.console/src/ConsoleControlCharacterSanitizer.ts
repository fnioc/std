// ConsoleControlCharacterSanitizer — escapes the control characters that can
// drive terminal escape sequences, ported from the reference internal static
// `ConsoleControlCharacterSanitizer`. An INTERNAL reference static class:
// module-scoped const, no registry install. Not exported from the package
// barrel.
//
// Escaped ranges: C0 (U+0000–U+001F, except \t \n \r which log formatting
// preserves), DEL (U+007F), and C1 (U+0080–U+009F) — the same ranges systemd
// and OpenSSH sanitize for terminal output. Each escaped character becomes a
// literal `\uXXXX` sequence (uppercase hex).

// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CHARS_TO_ESCAPE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

function escapeChar(c: string): string {
  return `\\u${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
}

export const ConsoleControlCharacterSanitizer = {
  /**
   * Returns `value` with every terminal-driving control character escaped.
   * Overloaded via the §42 varying-return cast: a definite string in gives a
   * definite string out.
   */
  sanitize: ((value: string | undefined): string | undefined => {
    if (value === undefined || value === '') {
      return value;
    }
    return value.replace(CHARS_TO_ESCAPE, escapeChar);
  }) as {
    (value: string): string;
    (value: string | undefined): string | undefined;
  },
};
