/**
 * Restates `T`'s members as a type literal, which carries the implicit index
 * signature an `interface` lacks. An augmentation member map declared as an
 * `interface` (the shape `this`-polymorphic returns require) needs this wrapper
 * to satisfy `AugmentationSet2`'s `Record<PropertyKey, Func>` constraint.
 *
 * The trailing `& {}` is for the reader, not the checker: it makes an error or a hover print the
 * members rather than the alias name. Keep it — deleting it changes nothing that type-checks, so
 * nothing will fail to tell you it is gone.
 */
export type Flatten<T> = {
  [K in keyof T]: T[K];
} & {};
