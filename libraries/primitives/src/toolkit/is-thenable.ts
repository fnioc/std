/**
 * Whether `value` follows the thenable protocol, so a foreign promise implementation reads
 * exactly as a native one does.
 */
export function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (typeof value === 'object' || typeof value === 'function')
    && value !== null
    && typeof (value as PromiseLike<unknown>).then === 'function';
}
