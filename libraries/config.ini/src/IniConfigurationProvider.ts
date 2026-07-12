// IniConfigurationProvider -- flattens an INI file's contents into the
// case-insensitive key/value store. The file plumbing lives in
// FileConfigurationProvider (config.file); this class only implements
// loadContent via the shared IniStreamParser. A parse failure (a line without
// `=`, a duplicate key) throws FormatError, which the base wraps in
// InvalidDataError.

import { FileConfigurationProvider } from '@rhombus-std/config.file';
import { IniStreamParser } from './ini-stream-parser';

export class IniConfigurationProvider extends FileConfigurationProvider {
  protected override loadContent(content: string): void {
    for (const [key, value] of IniStreamParser.parse(content)) {
      this.set(key, value);
    }
  }
}
