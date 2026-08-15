/**
 * Restates `T`'s members as a type literal, which carries the implicit index
 * signature an `interface` lacks. An augmentation's members reach its receiver
 * through `interface R extends Flatten<typeof TheAugmentations>`: the namespace's
 * own type is a module shape, and only the restated literal merges.
 *
 * The trailing `& {}` is for the reader, not the checker: it makes an error or a hover print the
 * members rather than the alias name. Keep it — deleting it changes nothing that type-checks, so
 * nothing will fail to tell you it is gone.
 */
export type Flatten<T> = {
  [K in keyof T]: T[K];
} & {};
