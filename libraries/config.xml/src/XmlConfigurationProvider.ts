// XmlConfigurationProvider -- flattens an XML file's contents into the
// case-insensitive key/value store. The file plumbing lives in
// FileConfigurationProvider (config.file); this class only implements
// loadContent via the shared XmlStreamParser. A parse failure (malformed XML,
// a namespace, a DTD, a duplicate key) throws FormatError, wrapped by the base
// in InvalidDataError.

import { FileConfigurationProvider } from '@rhombus-std/config.file';
import { XmlStreamParser } from './xml-stream-parser';

export class XmlConfigurationProvider extends FileConfigurationProvider {
  protected override loadContent(content: string): void {
    for (const [key, value] of XmlStreamParser.parse(content)) {
      this.set(key, value);
    }
  }
}
