// Memory provider barrel + the addInMemoryCollection augmentation.
//
// Even though the Memory provider lives in the same package as
// ConfigBuilder, its sugar method is installed via the SAME augmentation
// pattern the external provider packages use (TS declaration merging + a
// registry registration) -- `ConfigBuilder` itself carries no add* sugar
// of its own, only augmentations, even for the in-package Memory provider. The
// augmentation targets the package barrel "@rhombus-std/config" (the
// `config-source` condition on config's `.` export routes it back to
// ./src/index.ts for config's own compile -- di.core's self-source pattern),
// the same specifier chained/index.ts and with-type-augment.ts use, so all of
// config's own ConfigBuilder augmenters merge onto one type.
//
// `addInMemoryCollection` targets the OPEN `IConfigBuilder` receiver, so
// it registers against tokenfor<IConfigBuilder>() (docs §38)
// rather than installing directly: the reference extension method targets
// IConfigBuilder, and ConfigManager implements that interface
// too, so both concrete builders are decorated with that one token and a
// single registration reaches BOTH -- `manager.addInMemoryCollection(...)`
// works the same way `builder.addInMemoryCollection(...)` does. The
// augmentation's receiver is generic over any receiver whose `add()` returns
// itself, rather than pinned to ConfigBuilder<T>, so ONE object literal
// satisfies `AugmentationSet` for both classes while still preserving each
// one's own concrete return type through the fluent chain (ConfigBuilder<T>
// keeps T; ConfigManager stays ConfigManager).

import type { ConfigBuilder } from '@rhombus-std/config';
import type { IConfigBuilder, IConfigSource, IndexedSection } from '@rhombus-std/config.core';
import { type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives';
import { type ConfigData, MemoryConfigSource } from './MemoryConfigSource';

export { MemoryConfigProvider } from './MemoryConfigProvider';
export { type ConfigData, MemoryConfigSource } from './MemoryConfigSource';

// The generic arity + default MUST match the class declaration exactly, or
// declaration merging fails (TS2428). Every augmentation spells `<T =
// IndexedSection>` and imports the same `IndexedSection` from @rhombus-std/config.core.
declare module '@rhombus-std/config' {
  interface ConfigBuilder<T = IndexedSection> {
    /** Registers an in-memory configuration source seeded with `initialData`. */
    addInMemoryCollection(initialData?: ConfigData): this;
  }
}

// ConfigManager has no generic type parameter, so there's no TS2428
// arity concern here the way there is for ConfigBuilder<T>.
declare module '../ConfigManager' {
  interface ConfigManager {
    /** Registers an in-memory configuration source seeded with `initialData`. */
    addInMemoryCollection(initialData?: ConfigData): this;
  }
}

// One named object literal mirroring the reference `MemoryConfigBuilderExtensions`
// static class (docs §28/§38), registered against the shared
// IConfigBuilder token AND exported so the member is the standalone
// form. `TBuilder` is bounded by "has an add() that returns itself" rather than
// pinned to ConfigBuilder<T> -- see the module doc comment above.
export const MemoryConfigBuilderExtensions = {
  addInMemoryCollection<TBuilder extends { add(source: IConfigSource): TBuilder; }>(
    builder: TBuilder,
    initialData?: ConfigData,
  ): TBuilder {
    return builder.add(new MemoryConfigSource({ initialData }));
  },
} satisfies AugmentationSet<ConfigBuilder<unknown>>;

registerAugmentations(tokenfor<IConfigBuilder>(), MemoryConfigBuilderExtensions);
