// A mutable, subscribable IOptions<T>. The console registration constructs
// its formatter/logger instances directly rather than through a DI options
// pipeline, so later configuration calls need a way to reach an
// already-constructed instance — `reload(configure)` mutates the held value
// and notifies subscribers.

import type { IOptions } from '@rhombus-std/options';
import type { Func } from '@rhombus-toolkit/func';

/** A mutable options holder whose {@link reload} notifies subscribers. */
export class ReloadableOptions<T> implements IOptions<T> {
  readonly #value: T;
  readonly #listeners = new Set<Func<[T], void>>();

  public constructor(value: T) {
    this.#value = value;
  }

  public get value(): T {
    return this.#value;
  }

  public subscribe(listener: Func<[T], void>): Disposable {
    this.#listeners.add(listener);
    return { [Symbol.dispose]: () => {
      this.#listeners.delete(listener);
    } };
  }

  /** Applies `configure` to the held value, then notifies every subscriber. */
  public reload(configure?: Func<[T], void>): void {
    configure?.(this.#value);
    for (const listener of this.#listeners) {
      listener(this.#value);
    }
  }
}
