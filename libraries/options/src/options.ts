// Options<T> -- the collapsed accessor described in docs/decisions.md §4.2.
//
// MEO splits this into three: IOptions<T> (singleton snapshot),
// IOptionsSnapshot<T> (scoped snapshot), and IOptionsMonitor<T> (reactive,
// CurrentValue + OnChange). The singleton-vs-scoped split is a fixed-lifetime
// reference-DI artifact; this repo's open-ended scopes + registration-time
// lifetime (§3) erase it, so lifetime becomes a registration concern, not a
// distinct accessor type -- IOptions and IOptionsSnapshot collapse into one
// `value` getter. The reactive capability (IOptionsMonitor.OnChange) is
// orthogonal to lifetime and survives as `subscribe` -- present only when the
// source backing this Options<T> is reload-capable.
//
// NOT built here (see README): named options (MEO's `.Get(name)` -- §4.2
// treats named options as distinct registrations instead). The
// configure/validate/OptionsFactory pipeline IS now built -- in its own
// files (`options-factory.ts` and the step interfaces), adopted per §4.5.

import { ChangeToken, type ChangeTokenProducer } from "@rhombus-std/primitives";
import type { Func } from "@rhombus-toolkit/func";

/**
 * The current value of a bound options object -- collapses MEO's
 * `IOptions<T>` / `IOptionsSnapshot<T>` / `IOptionsMonitor<T>.CurrentValue`
 * into one accessor. See the module doc for why.
 */
export interface Options<T> {
  /**
   * The current value. For a static snapshot ({@link Options.of}) this
   * never changes; for a reactive instance ({@link Options.watch}) this
   * re-reads the live value on every access.
   */
  readonly value: T;

  /**
   * Registers `listener` to be called whenever the underlying value
   * changes. Present only when the source backing this `Options<T>` is
   * reload-capable -- absent (`undefined`) for a static snapshot.
   *
   * @param listener Called with the new value each time it changes.
   * @returns A {@link Disposable} that unregisters `listener`.
   */
  subscribe?(listener: Func<[T], void>): Disposable;
}

/**
 * A static `Options<T>` snapshot: `value` never changes and `subscribe` is
 * absent. Mirrors MEO's `Options.Create`.
 */
function of<T>(value: T): Options<T> {
  return { value };
}

/**
 * A reactive `Options<T>` backed by a change-token producer. `value`
 * re-reads `getValue()` on every access -- so it always reflects the latest
 * state, mirroring `IOptionsMonitor<T>.CurrentValue`. `subscribe` wires
 * `listener` through {@link ChangeToken.onChange}, which re-subscribes to
 * the next token after every fire so later changes keep being observed.
 *
 * @param getValue Reads the current value. Called on every `.value` access
 * and once per fire, before `listener` runs.
 * @param produceToken Produces the change token to watch next -- see
 * {@link ChangeTokenProducer}.
 */
function watch<T>(getValue: Func<[], T>, produceToken: ChangeTokenProducer): Options<T> {
  return {
    get value(): T {
      return getValue();
    },
    subscribe(listener: Func<[T], void>): Disposable {
      return ChangeToken.onChange(produceToken, () => listener(getValue()));
    },
  };
}

/**
 * Constructs an {@link Options}. Mirrors MEO's `Options` static class.
 */
export const Options = { of, watch };
