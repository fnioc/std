/**
 * The one table every {@link Type} comes from: two structurally identical types are the same
 * object, so `===` is the equality operator for the whole subsystem.
 *
 * @remarks
 * Identity is keyed on child identity, never on a node's spelling. Round-tripping a key through
 * `Type.stringify` would make identity depend on the escaping grammar being injective, so an
 * escaping bug would stop being a spelling bug and start merging two distinct types into one
 * object — the one failure this table must never produce. Keying on already-interned child ids
 * keeps the grammar out of identity entirely, and keeps a key proportional to a node's arity
 * rather than to its whole subtree.
 *
 * A spelling is still the sort key for union and intersection members, where a collision could
 * only fragment identity, never merge it.
 *
 * The table is module state, so a bundle carrying a second copy of this package forks it and `===`
 * begins answering `false` across the seam. Every bundling package keeps `@rhombus-std/primitives`
 * external for that reason.
 */

import type { Func } from '@rhombus-toolkit/func';
import type { Type } from '../Type.js';

const table = new Map<string, Type>();
const ids = new WeakMap<Type, number>();
let nextId = 0;

/**
 * The interned node for `key`, minting one from `build` the first time the key is seen.
 *
 * @param build - called only on a miss, so a caller may prepare its slots eagerly without paying
 * for a node the table already holds.
 */
export function intern<T extends Type>(key: string, build: Func<[], T>): T {
  const found = table.get(key);
  if (found !== undefined) {
    return found as T;
  }
  const minted = freeze(build());
  ids.set(minted, nextId++);
  table.set(key, minted);
  return minted;
}

/**
 * Whether this table minted `type`.
 *
 * @remarks
 * Unforgeable, and the reason nodes need no runtime marker: the map is module-private, so nothing
 * outside this file can add an entry to it — unlike a branding symbol, which
 * `Object.getOwnPropertySymbols` hands out and `Object.defineProperty` copies onto an impostor.
 */
export function isInterned(type: Type): boolean {
  return ids.has(type);
}

/** The identity of an interned node, as it appears in the key of any node built over it. */
export function id(type: Type): number {
  return ids.get(type)!;
}

/**
 * Seals a node and the arrays or records holding its children, a callable's rows of parameters
 * included. The children themselves arrive already interned, and so already frozen.
 */
function freeze<T extends Type>(node: T): T {
  for (const slot of Object.values(node)) {
    if (typeof slot === 'object' && slot !== null) {
      Object.freeze(slot);
      for (const nested of Object.values(slot as object)) {
        if (Array.isArray(nested)) {
          Object.freeze(nested);
        }
      }
    }
  }
  return Object.freeze(node);
}
