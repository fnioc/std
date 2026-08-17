// The `.withType<T>()` authoring surface: the declaration that puts the member
// on `ConfigBuilder`, and the marker body the inline stage substitutes at every
// call site. Depending on this package is what both types the member and spawns
// the transform, so a consumer without it cannot name `withType` at all.

import type { ConfigBuilder } from '@rhombus-std/config';
import type { IndexedSection } from '@rhombus-std/config.core';
import { registerInlineBodies, schemaof } from '@rhombus-std/primitives.extras';

// The declaration targets the package barrel `@rhombus-std/config` — the same
// specifier every other `ConfigBuilder` augmenter uses, so they all merge onto
// one type. Mixing specifiers phantom-splits the class.
//
// `ConfigBuilder` arrives as a named import rather than a member reference,
// because unqualified names in a `declare module` body resolve in THIS file's
// scope.
declare module '@rhombus-std/config' {
  interface ConfigBuilder<T = IndexedSection> {
    /**
     * Coerces the builder's output type against a schema derived from `U`.
     */
    withType<U>(): ConfigBuilder<U>;
  }
}

/** Receiver shape the sugar body is compiled against. */
interface IWithSchemaTarget {
  withSchema(schema: unknown): unknown;
}

/** `withType<T>()` sugar: `this.withSchema(schemaof<T>())`. */
export const ConfigBuilderInline = {
  withType<T>(this: IWithSchemaTarget): unknown {
    return this.withSchema(schemaof<T>());
  },
};
registerInlineBodies<ConfigBuilder>(ConfigBuilderInline);
