// ConsoleUtils — platform console introspection: the stdout/stderr streams and
// the "should we emit ANSI color codes" decision. The reference keeps the
// equivalent logic in a shared internal `ConsoleUtils` helper.
//
// PLATFORM TYPING NOTE (§44): @rhombus-std/primitives' `ProcessLike` does not
// yet carry `stderr` or the streams' `isTTY` flag, and this slice does not
// reach into primitives — so this module widens the imported typed `process`
// with a module-local structural type, same §44 recipe (no ambient platform
// types). Once `ProcessLike` gains those members the local widening retires.

import { process, type ProcessLike } from '@rhombus-std/primitives';

/** A writable standard stream with the TTY flag console color detection reads. */
export interface ConsoleStream {
  write(chunk: string): boolean;
  readonly isTTY?: boolean;
}

interface ConsoleProcessLike extends ProcessLike {
  readonly stdout: ConsoleStream;
  readonly stderr: ConsoleStream;
}

const consoleProcess = process as ConsoleProcessLike;

/** The standard output stream. */
export const stdout: ConsoleStream = consoleProcess.stdout;

/** The standard error stream. */
export const stderr: ConsoleStream = consoleProcess.stderr;

/**
 * Whether formatters should emit ANSI color escape codes for `stream` — the
 * analog of the reference's redirection check, expressed with this platform's
 * conventions: the `NO_COLOR` environment variable (any non-empty value)
 * disables color, `FORCE_COLOR` (any non-empty value other than `"0"`)
 * enables it even when redirected, and otherwise color is on exactly when the
 * stream is a TTY.
 */
export function emitAnsiColorCodes(stream: ConsoleStream = stdout): boolean {
  const env = consoleProcess.env;
  const noColor = env['NO_COLOR'];
  if (noColor !== undefined && noColor !== '') {
    return false;
  }
  const forceColor = env['FORCE_COLOR'];
  if (forceColor !== undefined && forceColor !== '' && forceColor !== '0') {
    return true;
  }
  return stream.isTTY === true;
}
