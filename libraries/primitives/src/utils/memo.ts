import type { Func } from '@rhombus-toolkit/func';

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
    return answers.getOrInsertComputed(key, compute);
  };
}
