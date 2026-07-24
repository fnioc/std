// Tier 2 seam -- `.withType<T>()`, contributed later by @rhombus-std/config.extras.
//
// withType MUST NOT exist on the base ConfigBuilder: calling it without
// the transformer must be a COMPILE error, never a silent runtime lie. So it
// ships as a separate, opt-in side-effect module -- import
// "@rhombus-std/config/with-type-augment" to bring the declaration (and the
// throwing stub) into scope. The real @rhombus-std/config.extras will replace this
// stub with a compile-time transform that rewrites `.withType<T>()` into a
// generated `.withSchema({...})`.
//
// The type augmentation targets the package barrel "@rhombus-std/config" -- the
// SAME specifier the provider packages and config's own memory/chained
// augmenters use, so every ConfigBuilder augmentation merges onto one
// type (mixing specifiers phantom-splits the class). config's own compile
// resolves the barrel back to ./src/index.ts via the `config-source` condition
// on the `.` export (di.core's self-source pattern), so no not-yet-built dist is
// needed; external consumers of "@rhombus-std/config/with-type-augment" get the
// `declare module '@rhombus-std/config'` verbatim (its rollup config keeps the
// barrel external), merging onto their real ConfigBuilder. The runtime
// prototype patch imports the class through the relative module so bun shares
// one ConfigBuilder chunk across dist/bundle/index.js and
// dist/bundle/with-type-augment.js (a barrel value import can't self-resolve in the JS
// bundle); config-source makes that relative class the same symbol the barrel
// `declare module` augments, so the patch typechecks.

import type { IndexedSection } from '@rhombus-std/config.core';
import { ConfigBuilder } from './ConfigBuilder';

declare module '@rhombus-std/config' {
  interface ConfigBuilder<T = IndexedSection> {
    /**
     * TIER 2 -- contributed by @rhombus-std/config.extras, which rewrites this call
     * into `.withSchema({...generated literal...})` at compile time. Present
     * only when this augment is imported; without it, calling `withType` is a
     * compile error. Without the transformer's transform actually running, the
     * stub below throws.
     */
    withType<U>(): ConfigBuilder<U>;
  }
}

// Throwing runtime stub: if the augment's type is in scope but the transform
// did NOT run (transformer not installed / not configured), fail loud rather
// than silently returning an un-coerced builder.
ConfigBuilder.prototype.withType = function(): never {
  throw new Error(
    "withType<T>() requires @rhombus-std/config.extras's compile-time transform to run. "
      + 'It has not been applied. Use withSchema({...}) directly, or configure the transformer.',
  );
};
