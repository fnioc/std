// `.withType<T>()` seam -- contributed by @rhombus-std/config.extras.
//
// withType MUST NOT exist on the base ConfigBuilder: calling it without
// config.extras configured must be a COMPILE error, never a silent runtime
// lie. So it ships as a separate, opt-in side-effect module -- import
// "@rhombus-std/config/with-type-augment" to bring the declaration (and the
// throwing stub) into scope.
//
// The declaration targets the package barrel "@rhombus-std/config" -- the
// same specifier every other ConfigBuilder augmenter uses, so they all merge
// onto one type (mixing specifiers phantom-splits the class). The runtime
// patch imports ConfigBuilder through the relative module instead, so bun
// shares one ConfigBuilder chunk across dist/bundle/index.js and
// dist/bundle/with-type-augment.js -- a barrel value import can't
// self-resolve inside the bundle.

import type { IndexedSection } from '@rhombus-std/config.core';
import { ConfigBuilder } from './ConfigBuilder';

declare module '@rhombus-std/config' {
  interface ConfigBuilder<T = IndexedSection> {
    /**
     * Coerces the builder's output type against a schema derived from `U`.
     * Requires `@rhombus-std/config.extras` to be configured; present only
     * when this module is imported, so calling `withType` without it is a
     * compile error.
     */
    withType<U>(): ConfigBuilder<U>;
  }
}

// Throwing runtime stub: if the declaration is in scope but config.extras
// wasn't actually configured, fail loud rather than silently returning an
// un-coerced builder.
ConfigBuilder.prototype.withType = function(): never {
  throw new Error(
    "withType<T>() requires @rhombus-std/config.extras's compile-time transform to run. "
      + 'It has not been applied. Use withSchema({...}) directly, or configure the transformer.',
  );
};
