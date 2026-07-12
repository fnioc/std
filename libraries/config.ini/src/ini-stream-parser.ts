// IniStreamParser -- the INI text -> flat key/value pairs parser shared by
// IniConfigurationProvider (file) and IniStreamConfigurationProvider (in-memory
// payload); mirrors the reference's `IniStreamConfigurationProvider.Read`.
//
// Grammar (line-oriented, no reader dependency): blank lines and lines whose
// first non-space character is `;`, `#`, or `/` are comments and skipped. A
// `[Section:Header]` line sets the key prefix (its inner text, trimmed, plus
// the `:` delimiter). Any other line splits on the FIRST `=` (a line with no
// `=` is a FormatError); the key is `prefix + left.trim()` and the value is
// `right.trim()` with ONE surrounding pair of double quotes stripped. A
// duplicate resolved key (case-insensitively) is a FormatError.

import { configPath } from '@rhombus-std/config';
import { FormatError } from '@rhombus-std/config.file';

export const IniStreamParser = {
  /** Parses INI `content` into ordered `[key, value]` pairs. */
  parse(content: string): [key: string, value: string][] {
    const pairs: [key: string, value: string][] = [];
    const seen = new Set<string>();
    let sectionPrefix = '';

    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();

      if (!line) {
        continue;
      }
      const first = line[0];
      if (first === ';' || first === '#' || first === '/') {
        continue;
      }

      if (first === '[' && line.endsWith(']')) {
        sectionPrefix = line.slice(1, -1).trim() + configPath.KeyDelimiter;
        continue;
      }

      const separator = line.indexOf('=');
      if (separator < 0) {
        throw new FormatError(`Unrecognized INI line format: '${rawLine}'.`);
      }

      const key = sectionPrefix + line.slice(0, separator).trim();
      let value = line.slice(separator + 1).trim();
      if (value.length > 1 && value[0] === '"' && value.endsWith('"')) {
        value = value.slice(1, -1);
      }

      const folded = key.toLowerCase();
      if (seen.has(folded)) {
        throw new FormatError(`A duplicate key '${key}' was found.`);
      }
      seen.add(folded);
      pairs.push([key, value]);
    }

    return pairs;
  },
};
