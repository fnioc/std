// MemoryConfigProvider -- copies its source's initial data into the
// case-insensitive store at construction. No load() override -- the data is
// already present at construction time, so there's nothing left to load.

import { ConfigProvider } from '../ConfigProvider';
import { type MemoryConfigSource, toEntries } from './MemoryConfigSource';

export class MemoryConfigProvider extends ConfigProvider {
  public constructor(source: MemoryConfigSource) {
    super();
    if (source.initialData !== undefined) {
      for (const [key, value] of toEntries(source.initialData)) {
        this.set(key, value);
      }
    }
  }
}
