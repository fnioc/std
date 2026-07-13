// Tier 2 seam -- `.withType<T>()`, contributed later by @rhombus-std/config.transformer.
//
// withType MUST NOT exist on the base ConfigurationBuilder: calling it without
// the transformer must be a COMPILE error, never a silent runtime lie. So it
// ships as a separate, opt-in side-effect module -- import
// "@rhombus-std/config/with-type-augment" to bring the declaration (and the
// throwing stub) into scope. The real @rhombus-std/config.transformer will replace this
// stub with a compile-time transform that rewrites `.withType<T>()` into a
// generated `.withSchema({...})`.
//
// The type augmentation targets the public subpath specifier
// "@rhombus-std/config/configuration-builder" -- NOT the barrel the provider
// packages now use. This module compiles inside config's own program next to
// memory/chained's relative `../ConfigurationBuilder` merges; a barrel merge
// here would phantom-split the class against those, and a relative
// `./ConfigurationBuilder` does not survive rollup-plugin-dts (it gets rewritten
// to a self-referential `./with-type-augment`). The subpath threads the needle:
// `config-source` routes it to ./src/ConfigurationBuilder.ts for config's own
// compile, and it survives rollup-plugin-dts into the published
// dist/with-type-augment.d.ts verbatim. See config's package.json
// "//configuration-builder-subpath" note. The runtime prototype patch imports
// the class through the relative module so it's bundled into
// dist/with-type-augment.js.

import type { IndexedSection } from '@rhombus-std/config.core';
import { ConfigurationBuilder } from './ConfigurationBuilder';

declare module '@rhombus-std/config/configuration-builder' {
  interface ConfigurationBuilder<T = IndexedSection> {
    /**
     * TIER 2 -- contributed by @rhombus-std/config.transformer, which rewrites this call
     * into `.withSchema({...generated literal...})` at compile time. Present
     * only when this augment is imported; without it, calling `withType` is a
     * compile error. Without the transformer's transform actually running, the
     * stub below throws.
     */
    withType<U>(): ConfigurationBuilder<U>;
  }
}

// Throwing runtime stub: if the augment's type is in scope but the transform
// did NOT run (transformer not installed / not configured), fail loud rather
// than silently returning an un-coerced builder.
ConfigurationBuilder.prototype.withType = function(): never {
  throw new Error(
    "withType<T>() requires @rhombus-std/config.transformer's compile-time transform to run. "
      + 'It has not been applied. Use withSchema({...}) directly, or configure the transformer.',
  );
};
