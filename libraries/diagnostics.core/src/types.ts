import { Type } from '@rhombus-std/primitives';

/**
 * The collection wrapper for `element` -- what the engine recognizes as a
 * collection request and aggregates every registration of the element into.
 *
 * @remarks
 * Every diagnostics "collection" slot is registered with
 * `services.addValue(<type>, x)` and read back with
 * `resolver.resolve(collectionType(<type>))` -- the same wrapper convention
 * @rhombus-std/options.augmentations uses to aggregate every registration of a
 * slot.
 */
export function collectionType(element: Type): Type {
  return Type.array(element);
}
