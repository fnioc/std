// TextWriterExtensions — writes a message wrapped in ANSI color set/reset
// sequences, ported from the reference internal static `TextWriterExtensions`.
// An INTERNAL reference static class: module-scoped const, no registry
// install; call sites use `TextWriterExtensions.writeColoredMessage(writer, …)`.
// Not exported from the package barrel.

import { type ConsoleColor, DEFAULT_BACKGROUND_COLOR, DEFAULT_FOREGROUND_COLOR, getBackgroundColorEscapeCode,
  getForegroundColorEscapeCode } from './AnsiParser';
import type { TextWriter } from './text-writer';

export const TextWriterExtensions = {
  /**
   * Writes `message` with the given colors as embedded ANSI escape sequences:
   * background code, foreground code, message, foreground reset, background
   * reset — omitting each pair when its color is `undefined`.
   */
  writeColoredMessage(
    textWriter: TextWriter,
    message: string,
    background: ConsoleColor | undefined,
    foreground: ConsoleColor | undefined,
  ): void {
    if (background !== undefined) {
      textWriter.write(getBackgroundColorEscapeCode(background));
    }
    if (foreground !== undefined) {
      textWriter.write(getForegroundColorEscapeCode(foreground));
    }
    textWriter.write(message);
    if (foreground !== undefined) {
      textWriter.write(DEFAULT_FOREGROUND_COLOR);
    }
    if (background !== undefined) {
      textWriter.write(DEFAULT_BACKGROUND_COLOR);
    }
  },
};
