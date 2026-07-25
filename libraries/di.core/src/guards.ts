// The runtime discriminators for the `DepSlot` union — one per object slot kind,
// each identified by a key no other kind carries.

import type { DepSlot, FactoryRef, LiteralRef, TypeArgRef, Union } from './types.js';

export function isFactoryRef(slot: DepSlot): slot is FactoryRef {
  return (typeof slot === 'object' && slot !== null && typeof (slot as { type?: unknown; }).type === 'string');
}

export function isUnionSlot(slot: DepSlot): slot is Union {
  return (typeof slot === 'object' && slot !== null && Array.isArray((slot as { union?: unknown; }).union));
}

/**
 * A `LiteralRef` supplies a singular literal directly (`"dev"`, `42`, `true`,
 * `1n`) or the lone inhabitant of `void` / `undefined` / `null`. It is therefore
 * identified by the PRESENCE of the `value` key, never by `value !== undefined`.
 */
export function isLiteralRef(slot: DepSlot): slot is LiteralRef {
  return typeof slot === 'object' && slot !== null && 'value' in slot;
}

/** A `TypeArgRef` carries the 1-based hole number under `typeArg`. */
export function isTypeArgRef(slot: DepSlot): slot is TypeArgRef {
  return (typeof slot === 'object' && slot !== null && typeof (slot as { typeArg?: unknown; }).typeArg === 'number');
}
