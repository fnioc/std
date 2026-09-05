// Internal: not exported from the package barrel.

import { type ConsoleColor, DEFAULT_BACKGROUND_COLOR, DEFAULT_FOREGROUND_COLOR, getBackgroundColorEscapeCode, getForegroundColorEscapeCode } from './ConsoleColor';
import type { TextWriter } from './text-writer';

/**
 * Writes `message` with the given colors as embedded ANSI escape sequences:
 * background code, foreground code, message, foreground reset, background
 * reset — omitting each pair when its color is `undefined`.
 */
export function writeColoredMessage(textWriter: TextWriter, message: string, background: ConsoleColor | undefined, foreground: ConsoleColor | undefined): void {
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
}
