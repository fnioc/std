// Multimap -- a keyed collection where each key maps to an ORDERED list of
// values. Immutable-by-composition: it does NOT extend `Map`, the value groups
// are hard-private, and reads hand back read-only views -- so a caller can
// enumerate the contents but never splice a group behind the map's back.
//
// Backed by one array per key (`Map<Key, Value[]>`), so `add` is O(1) amortized
// and insertion order is preserved BOTH within a key's group and -- via the
// underlying `Map` -- across keys.

/**
 * A collection mapping each key to an ordered list of values. A second
 * {@link add} under an existing key APPENDS: values are never de-duplicated and
 * never replace one another, so a key's full insertion history survives.
 */
export class Multimap<Key, Value> {
  readonly #groups = new Map<Key, Value[]>();

  /**
   * Append `value` to `key`'s group, creating the group on first use. Returns
   * `this` so adds can chain.
   */
  public add(key: Key, value: Value): this {
    const group = this.#groups.get(key);
    if (group) {
      group.push(value);
    } else {
      this.#groups.set(key, [value]);
    }
    return this;
  }

  /**
   * The values added under `key`, in insertion order, as a read-only view --
   * an empty array when the key has no values.
   */
  public get(key: Key): readonly Value[] {
    return this.#groups.get(key) ?? [];
  }

  /** Whether any value has been added under `key`. */
  public has(key: Key): boolean {
    return this.#groups.has(key);
  }

  /** The keys that hold at least one value, in insertion order. */
  public keys(): IterableIterator<Key> {
    return this.#groups.keys();
  }

  /**
   * Every `[key, value]` pair -- one per value, grouped by key, in insertion
   * order within each group. A key holding N values yields N pairs.
   */
  public *[Symbol.iterator](): Generator<readonly [Key, Value]> {
    for (const [key, group] of this.#groups) {
      for (const value of group) {
        yield [key, value] as const;
      }
    }
  }
}
