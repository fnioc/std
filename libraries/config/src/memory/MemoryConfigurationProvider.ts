// MemoryConfigurationProvider -- copies its source's initial data into the
// case-insensitive store at construction. No load() override -- the data is
// already present at construction time, so there's nothing left to load.

import { ConfigurationProvider } from "../ConfigurationProvider";
import { type MemoryConfigurationSource, toEntries } from "./memory-configuration-source";

export class MemoryConfigurationProvider extends ConfigurationProvider {
  public constructor(source: MemoryConfigurationSource) {
    super();
    if (source.initialData !== undefined) {
      for (const [key, value] of toEntries(source.initialData)) {
        this.set(key, value);
      }
    }
  }
}
