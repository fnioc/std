import type { Func } from '@rhombus-toolkit/func';

/**
 * The value under `key`, creating and storing it on first request — `factory` receives the key
 * and runs only on a miss. Safe for maps that legitimately store `undefined` values.
 */
export function getOrCreate<Key, Value>(map: Map<Key, Value>, key: Key, factory: Func<[key: Key], Value>): Value {
  const existing = map.get(key);
  if (existing !== undefined || map.has(key)) {
    return existing as Value;
  }
  const created = factory(key);
  map.set(key, created);
  return created;
}
