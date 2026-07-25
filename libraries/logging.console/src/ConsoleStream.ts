import { process, type ProcessLike } from '@rhombus-std/primitives';

/** A writable standard stream with the TTY flag console color detection reads. */
export interface ConsoleStream {
  write(chunk: string): boolean;
  readonly isTTY?: boolean;
}

// ProcessLike doesn't yet carry stderr/isTTY, so this widens process locally
// with a structural type until it does.
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
 * Whether formatters should emit ANSI color escape codes for `stream`.
 *
 * @remarks
 * `NO_COLOR` (any non-empty value) disables color; `FORCE_COLOR` (any
 * non-empty value other than `"0"`) enables it even when not a TTY;
 * otherwise color is on exactly when the stream is a TTY.
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
