// Memory provider barrel + the addInMemoryCollection augmentation.
//
// Even though the Memory provider lives in the same package as
// ConfigurationBuilder, its sugar method is installed via the SAME augmentation
// pattern the external provider packages use (TS declaration merging + a
// registry registration) -- `ConfigurationBuilder` itself carries no add* sugar
// of its own, only augmentations, even for the in-package Memory provider. The
// augmentation targets the package barrel "@rhombus-std/config" (the
// `config-source` condition on config's `.` export routes it back to
// ./src/index.ts for config's own compile -- di.core's self-source pattern),
// the same specifier chained/index.ts and with-type-augment.ts use, so all of
// config's own ConfigurationBuilder augmenters merge onto one type.
//
// `addInMemoryCollection` targets the OPEN `IConfigurationBuilder` receiver, so
// it registers against nameof<IConfigurationBuilder>() (docs §38)
// rather than installing directly: the reference extension method targets
// IConfigurationBuilder, and ConfigurationManager implements that interface
// too, so both concrete builders are decorated with that one token and a
// single registration reaches BOTH -- `manager.addInMemoryCollection(...)`
// works the same way `builder.addInMemoryCollection(...)` does. The
// augmentation's receiver is generic over any receiver whose `add()` returns
// itself, rather than pinned to ConfigurationBuilder<T>, so ONE object literal
// satisfies `AugmentationSet` for both classes while still preserving each
// one's own concrete return type through the fluent chain (ConfigurationBuilder<T>
// keeps T; ConfigurationManager stays ConfigurationManager).

import type { ConfigurationBuilder } from '@rhombus-std/config';
import type { IConfigurationBuilder, IConfigurationSource, IndexedSection } from '@rhombus-std/config.core';
import { type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { nameof } from '@rhombus-std/primitives';
import { type ConfigurationData, MemoryConfigurationSource } from './memory-configuration-source';

export { type ConfigurationData, MemoryConfigurationSource } from './memory-configuration-source';
export { MemoryConfigurationProvider } from './MemoryConfigurationProvider';

// The generic arity + default MUST match the class declaration exactly, or
// declaration merging fails (TS2428). Every augmentation spells `<T =
// IndexedSection>` and imports the same `IndexedSection` from @rhombus-std/config.core.
declare module '@rhombus-std/config' {
  interface ConfigurationBuilder<T = IndexedSection> {
    /** Registers an in-memory configuration source seeded with `initialData`. */
    addInMemoryCollection(initialData?: ConfigurationData): this;
  }
}

// ConfigurationManager has no generic type parameter, so there's no TS2428
// arity concern here the way there is for ConfigurationBuilder<T>.
declare module '../ConfigurationManager' {
  interface ConfigurationManager {
    /** Registers an in-memory configuration source seeded with `initialData`. */
    addInMemoryCollection(initialData?: ConfigurationData): this;
  }
}

// One named object literal mirroring the reference `MemoryConfigurationBuilderExtensions`
// static class (docs §28/§38), registered against the shared
// IConfigurationBuilder token AND exported so the member is the standalone
// form. `TBuilder` is bounded by "has an add() that returns itself" rather than
// pinned to ConfigurationBuilder<T> -- see the module doc comment above.
export const MemoryConfigurationBuilderExtensions = {
  addInMemoryCollection<TBuilder extends { add(source: IConfigurationSource): TBuilder; }>(
    builder: TBuilder,
    initialData?: ConfigurationData,
  ): TBuilder {
    return builder.add(new MemoryConfigurationSource({ initialData }));
  },
} satisfies AugmentationSet<ConfigurationBuilder<unknown>>;

registerAugmentations(nameof<IConfigurationBuilder>(), MemoryConfigurationBuilderExtensions);
