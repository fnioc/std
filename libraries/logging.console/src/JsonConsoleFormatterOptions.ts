// JsonConsoleFormatterOptions — options for the JSON console formatter, ported
// from the reference `JsonConsoleFormatterOptions`.
//
// The reference `JsonWriterOptions` is the platform JSON-writer struct; this
// platform serializes with `JSON.stringify`, so the local `JsonWriterOptions`
// carries the members that map onto it: `indented`, `indentCharacter`, and
// `indentSize`. The reference struct's `Encoder`, `MaxDepth`, and
// `SkipValidation` have no `JSON.stringify` analog and are left out.

import { ConsoleFormatterOptions } from './ConsoleFormatterOptions';

/**
 * Controls how the JSON console formatter serializes each entry — the
 * `JSON.stringify`-shaped analog of the reference platform's JSON writer
 * options struct.
 */
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
