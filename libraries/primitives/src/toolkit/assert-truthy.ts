/**
 * Narrows `value` to what is there, naming it in the refusal when nothing is.
 *
 * @throws TypeError - when `value` is falsy.
 */
export function assertTruthy(value: unknown, name?: string): asserts value {
  if (!value) {
    throw new TypeError(`${name ?? 'a required value'} was falsy.`);
  }
}
