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

/**
 * `compute` with its answers remembered — one call per distinct key, every later ask served from
 * the cache.
 *
 * @remarks
 * The cache is reachable only from the returned function, so nothing else can write a fact about a
 * key that the walk over that key did not derive. Keys are held weakly: one that becomes
 * unreachable takes its answer with it. A call that throws stores nothing, so the next ask
 * recomputes.
 */
export function memo<Key extends WeakKey, Value>(compute: Func<[key: Key], Value>): Func<[key: Key], Value> {
  const answers = new WeakMap<Key, Value>();

  return function memoized(key: Key): Value {
    return getOrCreate(answers, key, compute);
  };
}
