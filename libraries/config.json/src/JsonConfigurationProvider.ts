// JsonConfigurationProvider -- flattens a JSON file's contents into the
// case-insensitive key/value store the base ConfigurationProvider serves.
//
// All the file plumbing (reading through the source's IFileProvider,
// optionality, reload-on-change, the atomic store swap, and error routing)
// lives in FileConfigurationProvider (config.file). This class only implements
// `loadContent`: parse the decoded text and push each flattened pair through
// `set()`. A parse failure throws FormatError, which the base rethrows wrapped
// in InvalidDataError (carrying the file path).
//
// The parse + flattening rules live in the shared JsonConfigurationFileParser
// (also used by JsonStreamConfigurationProvider) -- see that module's header
// for the null/empty-leaf semantics.

import { FileConfigurationProvider } from '@rhombus-std/config.file';
import { JsonConfigurationFileParser } from './json-configuration-file-parser';

export class JsonConfigurationProvider extends FileConfigurationProvider {
  protected override loadContent(content: string): void {
    for (const [key, value] of JsonConfigurationFileParser.parse(content, 'JsonConfigurationProvider')) {
      this.set(key, value);
    }
  }
}
