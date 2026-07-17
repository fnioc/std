// JsonConfigProvider -- flattens a JSON file's contents into the
// case-insensitive key/value store the base ConfigProvider serves.
//
// All the file plumbing (reading through the source's IFileProvider,
// optionality, reload-on-change, the atomic store swap, and error routing)
// lives in FileConfigProvider (config.file). This class only implements
// `loadContent`: parse the decoded text and push each flattened pair through
// `set()`. A parse failure throws FormatError, which the base rethrows wrapped
// in InvalidDataError (carrying the file path).
//
// The parse + flattening rules live in the shared JsonConfigFileParser
// (also used by JsonStreamConfigProvider) -- see that module's header
// for the null/empty-leaf semantics.

import { FileConfigProvider } from '@rhombus-std/config.file';
import { JsonConfigFileParser } from './JsonConfigFileParser';

export class JsonConfigProvider extends FileConfigProvider {
  protected override loadContent(content: string): void {
    for (const [key, value] of JsonConfigFileParser.parse(content, 'JsonConfigProvider')) {
      this.set(key, value);
    }
  }
}
