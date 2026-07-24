// Only the members JSON.stringify can actually express are offered here
// (indentation); writer-level knobs with no JSON.stringify equivalent
// (encoding, max depth, validation-skipping) are left out.

import { ConsoleFormatterOptions } from './ConsoleFormatterOptions';

/** Controls how the JSON console formatter serializes each entry. */
export interface JsonWriterOptions {
  /** Whether the JSON should be pretty-printed. Defaults to `false` (compact). */
  indented?: boolean;

  /** The character used for indentation when {@link indented}. Defaults to a space. */
  indentCharacter?: string;

  /** How many {@link indentCharacter}s one indent level is. Defaults to 2. */
  indentSize?: number;
}

/** Options for the built-in JSON console log formatter. */
export class JsonConsoleFormatterOptions extends ConsoleFormatterOptions {
  /** How the formatter's JSON writer serializes each entry. */
  public jsonWriterOptions: JsonWriterOptions = {};
}
