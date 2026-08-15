import type { Func } from '@rhombus-toolkit/func';

/**
 * The read/write surface {@link getOrCreate} works against. `Map` and `WeakMap` both supply it, so
 * a cache keyed by objects can hold its keys weakly without a second helper.
 */
export interface Store<in Key, in out Value> {
  get(key: Key): Value | undefined;

  has(key: Key): boolean;

  set(key: Key, value: Value): unknown;
}

/**
 * The value under `key`, creating and storing it on first request — `factory` receives the key
 * and runs only on a miss. Safe for stores that legitimately hold `undefined` values.
 */
export function getOrCreate<Key, Value>(store: Store<Key, Value>, key: Key, factory: Func<[key: Key], Value>): Value {
  const existing = store.get(key);
  if (existing !== undefined || store.has(key)) {
    return existing as Value;
  }
  const created = factory(key);
  store.set(key, created);
  return created;
}
