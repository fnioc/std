// ReloadableOptions — a mutable, subscribable IOptions<T>, the console
// package's stand-in for the reference DI options-monitor pipeline.
//
// The reference wires `AddConsole`'s configure delegates through DI
// (`IConfigureOptions<T>` registrations resolved into an `IOptionsMonitor<T>`
// when the provider is constructed). This repo's console registration
// constructs the provider directly (see ./console-logger-augmentations), so
// later configure delegates must reach an ALREADY-constructed provider — this
// class carries them: `reload(configure)` mutates the held value and notifies
// subscribers, which is exactly the `OnChange` path the reference provider and
// formatters already handle.
//
// (The reference's own `FormatterOptionsMonitor` — a static never-changing
// monitor — collapses to `Options.of` from @rhombus-std/options and needs no
// port.)

import type { IOptions } from '@rhombus-std/options';
import type { Func } from '@rhombus-toolkit/func';

/** A mutable {@link Options} whose {@link reload} notifies subscribers. */
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
    return {
      [Symbol.dispose]: () => {
        this.#listeners.delete(listener);
      },
    };
  }

  /** Applies `configure` to the held value, then notifies every subscriber. */
  public reload(configure?: Func<[T], void>): void {
    configure?.(this.#value);
    for (const listener of this.#listeners) {
      listener(this.#value);
    }
  }
}
