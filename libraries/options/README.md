# @rhombus-std/options

The collapsed `Options<T>` accessor ported from `ME.Options`
(MEO). Depends on `@rhombus-std/primitives` for change notification.

## `Options<T>`

MEO splits accessing bound options three ways: `IOptions<T>` (singleton
snapshot), `IOptionsSnapshot<T>` (scoped snapshot), and `IOptionsMonitor<T>`
(reactive, `CurrentValue` + `OnChange`). Per
[`docs/decisions.md` §4.2](../../docs/decisions.md), the singleton-vs-scoped
split is a fixed-lifetime reference-DI artifact that this repo's open-ended scopes
and registration-time lifetime erase, so `IOptions` and `IOptionsSnapshot`
collapse into **one** `value` getter. The reactive capability is orthogonal
to lifetime and survives as an optional `subscribe`:

```ts
export interface Options<T> {
  readonly value: T;
  subscribe?(listener: (value: T) => void): Disposable;
}
```

`subscribe` is present only when the source backing an `Options<T>` is
reload-capable -- a static snapshot has no `subscribe` at all.

## Basic usage

```ts
import { Options } from "@rhombus-std/options";

// Static snapshot -- value never changes, no subscribe.
const options = Options.of({ port: 8080 });
options.value; // { port: 8080 }
options.subscribe; // undefined

// Reactive -- value re-reads getValue() on every access; subscribe wires a
// listener through a change-token producer (see @rhombus-std/primitives).
import { CancellationChangeToken } from "@rhombus-std/primitives";

let controller = new AbortController();
const monitor = Options.watch(
  () => currentConfig(),
  () => new CancellationChangeToken(controller.signal),
);

const registration = monitor.subscribe!((value) =>
  console.log("changed", value)
);
controller.abort(); // logs "changed" with the latest value
registration[Symbol.dispose]();
```

As with `ChangeToken.onChange`, the token producer passed to `Options.watch`
must hand back a token representing the _next_ change window on each call --
see the primitives README for why a stale, already-fired token causes
`subscribe` to fire synchronously forever.

## The `OptionsFactory` pipeline

`OptionsFactory<T>` assembles a bound options value by running four stages,
mirroring MEO's `OptionsFactory<TOptions>` (see
[`docs/decisions.md` §4.5](../../docs/decisions.md)):

```
make base -> configure steps -> post-configure steps -> validate -> return
```

- **`ConfigureOptions<T>`** (`configure(options)`) -- composes the value from
  its sources; steps run in registration order. Config-bind is a configure
  step, registered by `@rhombus-std/options.augmentations`.
- **`PostConfigureOptions<T>`** (`postConfigure(options)`) -- a guaranteed-last
  pass, run after every configure step.
- **`ValidateOptions<T>`** (`validate(options): ValidateOptionsResult`) --
  semantic checks over the post-configured value.

```ts
import { OptionsFactory, ValidateOptionsResult } from "@rhombus-std/options";

const factory = new OptionsFactory<{ port: number }>(
  () => ({ port: 0 }),
  [{ configure: (o) => (o.port = 8080) }],
  [{ postConfigure: (o) => (o.port = o.port || 80) }],
  [{
    validate: (o) =>
      o.port > 0
        ? ValidateOptionsResult.success
        : ValidateOptionsResult.fail("port must be positive"),
  }],
);

factory.create(); // { port: 8080 }
```

Steps carry **no name parameter** -- named options are distinct registrations
here (§4.2), so a factory serves one registration. The base instance is
supplied as the `makeBase` function (TS has no reflective `Activator`
analog). If any validate step fails, every step's failures are aggregated
into one thrown `OptionsValidationError`.

There is **no `OptionsCache<T>`**: instance caching is a registration-lifetime
concern in this design (§3 / §4.5), not a type shipped here.

## Not built here

- **Named options** (`.Get(name)`). Per §4.2, named options are distinct
  registrations (tokens/sections) in this repo, not a name-parameterized
  accessor -- so there is no `OptionsMonitor.Get(name)` analog here.
- **The DI-builder registration augmentation** (`addOptions`/`configure`,
  MEO's `OptionsServiceCollectionExtensions`). Blocked on
  [#36](https://github.com/fnioc/std/issues/36) -- building it would require
  importing the DI runtime, which this package deliberately does not depend
  on.
