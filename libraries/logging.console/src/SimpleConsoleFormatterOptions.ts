// SimpleConsoleFormatterOptions — options for the default ("simple") console
// formatter, ported from the reference `SimpleConsoleFormatterOptions`.

import { ConsoleFormatterOptions } from './ConsoleFormatterOptions';
import { LoggerColorBehavior } from './LoggerColorBehavior';

/** Options for the built-in default console log formatter. */
export class SimpleConsoleFormatterOptions extends ConsoleFormatterOptions {
  /** When to use color when logging messages. Defaults to {@link LoggerColorBehavior.Default}. */
  public colorBehavior: LoggerColorBehavior = LoggerColorBehavior.Default;

  /** Whether the entire message is logged in a single line. Defaults to `false`. */
  public singleLine = false;
}
