// Owned structural typing for the browser `console` global — the §39/§44
// recipe (see @rhombus-std/primitives' abort.ts/process.ts): library programs
// carry ZERO ambient platform types (`types: []`), so naming the console
// requires an owned structural interface plus a typed `globalThis` lookup —
// never lib.dom.
//
// `ConsoleLike` is exactly the member set this package calls — the four
// level-mapped write methods — not a platform-complete surface; extend it when
// a consumer actually calls something new. One-way assignability is all that
// is required (platform console -> ConsoleLike; we never hand ours back to a
// platform API).

/** The console-global surface this provider writes through. */
export interface ConsoleLike {
  /** Writes an error-severity message ({@link LogLevel.Error}/{@link LogLevel.Critical}). */
  error(...args: unknown[]): void;
  /** Writes a warning-severity message ({@link LogLevel.Warning}). */
  warn(...args: unknown[]): void;
  /** Writes an informational message ({@link LogLevel.Information}). */
  info(...args: unknown[]): void;
  /** Writes a debug-severity message ({@link LogLevel.Trace}/{@link LogLevel.Debug}). */
  debug(...args: unknown[]): void;
}

/**
 * The platform `console` global, re-typed against {@link ConsoleLike}. No
 * runtime fallback — every browser (and node/bun/deno) supplies it.
 */
export const console: ConsoleLike = (globalThis as unknown as { console: ConsoleLike }).console;
