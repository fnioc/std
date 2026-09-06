// registerInlineBodies is a runtime no-op that documents, in code, that an
// inline sugar body set is published in the declaring package's
// `package.json` "rhombus-std" marker's "inline" list. Nothing in TypeScript imports such a
// set, so without this call it reads as dead code and a reader has no way to
// tell why it exists; calling it beside the declaration fixes both problems.

import type { AugmentationSet } from '@rhombus-std/primitives';

/**
 * Declares, in code, that `bodies` is an inline sugar body set published in
 * the declaring package's `package.json` "rhombus-std" marker "inline" list.
 *
 * @remarks
 * The receiver arrives as a type argument, the same way
 * `registerAugmentations<R>` takes it. Spell it on the declaration too —
 * `satisfies AugmentationSet<Receiver>` on the object literal is what rejects
 * a member the receiver does not declare.
 *
 * A runtime no-op — the file these sets live in is never bundled or executed.
 * Call it at module level, immediately beside the set's declaration, never
 * wrapping it: tooling locates a set by its top-level `const` declaration, so
 * wrapping it in a call would hide the set behind a call expression.
 *
 * @example
 * ```ts
 * export const ConfigBuilderInline = {
 *   withType<T>(this: IWithSchemaTarget): unknown {
 *     return this.withSchema(schemaof<T>());
 *   },
 * } satisfies AugmentationSet<ConfigBuilder>;
 * registerInlineBodies<ConfigBuilder>(ConfigBuilderInline);
 * ```
 */
export function registerInlineBodies<Receiver>(_bodies: AugmentationSet<Receiver>): void {
  // Intentionally empty -- see the file header.
}
