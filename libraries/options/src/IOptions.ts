import { ChangeToken, type ChangeTokenProducer } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/types';

/**
 * A bound options object of type `T`: `value` reads the current value, and the
 * optional `subscribe` observes changes when the backing source is reload-capable.
 */
export interface IOptions<T> {
  /**
   * The current value. For a static snapshot ({@link Options.of}) this
   * never changes; for a reactive instance ({@link Options.watch}) this
   * re-reads the live value on every access.
   */
  readonly value: T;

  /**
   * Registers `listener` to be called whenever the underlying value
   * changes. Present only when the source backing this `IOptions<T>` is
   * reload-capable -- absent (`undefined`) for a static snapshot.
   *
   * @param listener Called with the new value each time it changes.
   * @returns A {@link Disposable} that unregisters `listener`.
   */
  subscribe?(listener: Func<[T], void>): Disposable;
}

/**
 * A static `IOptions<T>` snapshot: `value` never changes and `subscribe` is absent.
 */
function of<T>(value: T): IOptions<T> {
  return { value };
}

/**
 * A reactive `IOptions<T>` backed by a change-token producer: `value` re-reads
 * `getValue()` on every access, and `subscribe` observes changes through
 * {@link ChangeToken.onChange}.
 *
 * @param getValue Reads the current value. Called on every `.value` access and
 * once per fire, before `listener` runs.
 * @param produceToken Produces the change token to watch next.
 */
function watch<T>(getValue: Func<[], T>, produceToken: ChangeTokenProducer): IOptions<T> {
  return { get value(): T {
    return getValue();
  }, subscribe(listener: Func<[T], void>): Disposable {
    return ChangeToken.onChange(produceToken, () => listener(getValue()));
  } };
}

/**
 * Factory for {@link IOptions} values: {@link of} for a static snapshot,
 * {@link watch} for a reactive one.
 */
export const Options = { of, watch };
