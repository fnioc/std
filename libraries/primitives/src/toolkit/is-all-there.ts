export function isAllThere<T>(items: Array<T | undefined>): items is T[];
export function isAllThere<T>(items: Iterable<T | undefined>): items is Iterable<T> {
  return Iterator.from(items).every(item => item !== undefined);
}
