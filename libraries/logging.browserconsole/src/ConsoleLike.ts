// Structural stand-in for the browser `console` global — library programs
// carry no ambient platform types, so this owns a minimal interface plus a
// typed `globalThis` lookup instead of pulling in lib.dom.
//
// Covers only the four level-mapped write methods this package calls; extend
// it when a consumer needs another one. Only needs one-way assignability
// (platform console -> ConsoleLike), since we never hand ours back to a
// platform API.

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
export const console: ConsoleLike = (globalThis as unknown as { console: ConsoleLike; }).console;
