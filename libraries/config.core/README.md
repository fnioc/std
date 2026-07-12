# @rhombus-std/config.core

**The configuration interfaces, with no runtime behind them.**

This package defines what a configuration tree, a configuration source, and a
configuration builder _are_ — as TypeScript interfaces only. It ships zero
JavaScript: every export erases at compile time via `import type`. Write it
when you're authoring your own configuration source or an alternate engine
and want to type against the same contracts the rest of the stack uses,
without pulling in a runtime you don't need.

## Install

```sh
bun add @rhombus-std/config.core
```

You'll rarely install this on its own for application code — `@rhombus-std/config`
already re-exports every type here, so depending on it pulls these in for
free. Reach for `config.core` directly when you're writing a package that
needs the types (for example, a custom `IConfigurationSource`) without
depending on the engine that implements them.

## Usage

```ts
import type { IConfiguration,
  IConfigurationSource } from '@rhombus-std/config.core';

function readPort(config: IConfiguration): string | undefined {
  return config.get('Server:Port');
}
```

Because every import is `import type`, none of this leaves a trace in a
built bundle — the types disappear at compile time, and nothing here needs a
runtime implementation to type-check against.

## Key exports

All of these are types/interfaces — no runtime values.

| Export                   | Describes                                                                                                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IConfiguration`         | A node in the configuration tree: `get`/`getNum`/`getBool` leaf reads, `set`, `getSection`, `getChildren`, `toObject`, `getReloadToken`.                                      |
| `IConfigurationSection`  | An `IConfiguration` node that also knows its own `key`, `path`, and settable `value` — a sub-tree, not the root.                                                              |
| `IConfigurationRoot`     | An `IConfiguration` that owns `providers` and can `reload()` them.                                                                                                            |
| `IConfigurationBuilder`  | Accumulates `IConfigurationSource`s via `add()` and turns them into an `IConfigurationRoot` via `build()`. Exposes a shared `properties` bag for builder↔source coordination. |
| `IConfigurationManager`  | Both an `IConfigurationBuilder` and an `IConfiguration` at once — a mutable object you can keep adding sources to while also reading it live.                                 |
| `IConfigurationSource`   | A factory: `build(builder)` returns the `IConfigurationProvider` for this source.                                                                                             |
| `IConfigurationProvider` | The read/write backend behind one source: `tryGet`, `set`, `load`, `getChildKeys`, `getReloadToken`.                                                                          |
| `ITryGetResult<T>`       | The tuple `[false]` on a miss or `[true, value]` on a hit — the return shape for lookups that need to distinguish "absent" from "present but falsy."                          |
| `ConfigObject`           | The nested plain-string-object shape returned by `IConfiguration.toObject()`.                                                                                                 |
| `IndexedSection`         | An `IConfigurationSection` with an index signature, so `config.Server.Port`-style dot/bracket navigation type-checks on an untyped tree.                                      |

Every accessor here is deliberately one-type-per-input: `get` returns a raw
string or a caller-supplied factory's result, `getNum`/`getBool` coerce and
throw rather than silently returning a wrong or `NaN` value, and
`getSection` never returns `null` — an absent section is just an empty one.

## How it fits

`config.core` is the types-only foundation for the configuration family. It
depends on [`primitives`](../primitives/README.md) for the `IChangeToken`
type used by `getReloadToken()`, and on nothing else.

- [`config`](../config/README.md) is the concrete engine — the builder,
  root, and section tree that actually implement these interfaces, plus
  reload tokens and a runtime schema.
- The source packages — `config.json`, `config.env`, `config.commandline` —
  each implement `IConfigurationSource`/`IConfigurationProvider` and register
  themselves onto `IConfigurationBuilder`/`IConfigurationManager`.
- [`options.augmentations`](../options.augmentations/README.md) binds an
  `IConfiguration` section into an `Options<T>`, using these same interfaces
  as its input.

If you're building an application, install `@rhombus-std/config` (and the
providers you need) instead — this package is for library authors who need
the shape without the implementation.

## Notes

- Zero runtime means zero side effects: importing this package never runs
  any code, registers anything, or touches a builder. It only exists at the
  type level.
- `IConfigurationManager` is a structural combination (`extends IConfiguration, IConfigurationBuilder`) —
  any object satisfying both shapes satisfies it, with no marker or brand required.
