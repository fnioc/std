// Inline-sugar impl body for the `.withType<T>()` config schema sugar — see the
// "rhombus.inline" key in this package's package.json.
//
// Authored, never executed: the generic inline transform stage substitutes this
// single-return-expression body at consumer call sites (this → the receiver, the
// type parameter bound from the checker), then the schemaof primitive stage lowers
// the result. The body contains `schemaof<T>()` over an UNBOUND generic, so it must
// never go through a per-file primitive lowering here — with no type to bind, that
// lowering has nothing to derive. This file is therefore protected exactly like
// `@rhombus-std/di.extras`'s `src/inline.ts`: the barrel (`src/index.ts`) does
// NOT re-export it, so `bun build` never pulls it into `dist` and it ships nowhere.
// It exists purely as SUBSTITUTION SOURCE the inline stage side-parses out of `src/`;
// the typecheck gate still sees it (§15 phantom-typing guard: the `withType<T>()`
// sugar is a pure typing that never runs post-transform), but nothing lowers or ships
// it.
//
// `schemaof` is the authoring-time config-schema primitive (this package); the
// inline stage records the `schemaof<T>()` call in its artifacts so the schemaof
// stage lowers it to the runtime schema literal (and materializes the OPTIONAL
// import a wrapped field needs). It is imported via a package-relative specifier —
// its home IS this package.

import { schemaof } from './schemaof.js';

/**
 * The one-method view of the `withSchema` verb the sugar body lowers against — the
 * receiver type its `this` parameter carries. The real `withSchema({...})` member
 * lives on the concrete `ConfigBuilder`; this interface is the transformer-side view
 * of the receiver and never appears in emitted output (the inline stage substitutes
 * only the body's return expression and drops the `this` parameter).
 */
interface IWithSchemaTarget {
  withSchema(schema: unknown): unknown;
}

/**
 * `withType<T>()` sugar body — the schema-driven config typing. It is the EXACT
 * hand-written form a no-transformer consumer would author:
 *
 *   withType<T>() → this.withSchema(schemaof<T>())
 *
 * The single type-parameter `T` (count 1, zero value parameters — `this` excluded)
 * discriminates this body against the runtime `withSchema` verb (count 0, one value
 * parameter), so the inline stage never confuses them. `schemaof<T>()` lowers to the
 * `{...}` runtime schema literal byte-identically to the config `.withType` stage's
 * output (both drive the same schema walk).
 */
export const ConfigBuilderInline = {
  withType<T>(this: IWithSchemaTarget): unknown {
    return this.withSchema(schemaof<T>());
  },
};
