# @rhombus-std/config.core

**The configuration abstractions — the interfaces plus the small helper
surface that belongs alongside them.**

This package defines what a configuration tree, a configuration source, and a
configuration builder _are_ — as TypeScript interfaces. Alongside them it ships
a small runtime that is abstraction-level, not engine-level: the `configPath`
key helpers, the `ConfigAugmentations`/`ConfigRootAugmentations` convenience
member sets plus the `exists` predicate, and `isConfigSection` (a runtime guard
that tells a section from a root). The interfaces still erase at compile time
via `import type`; the helper surface is a few kilobytes of pure, side-effect-free
JavaScript. Write against this package when you're authoring your own
configuration source or an alternate engine and want the same contracts the rest
of the stack uses, without pulling in the full engine.

## Install

```sh
bun add @rhombus-std/config.core
```

You'll rarely install this on its own for application code — `@rhombus-std/config`
already re-exports every type here, so depending on it pulls these in for
free. Reach for `config.core` directly when you're writing a package that
needs the types (for example, a custom `IConfigSource`) without
depending on the engine that implements them.

## Usage

```ts
import type { IConfig, IConfigSource } from '@rhombus-std/config.core';

function readPort(config: IConfig): string | undefined {
  return config.get('Server:Port');
}
```

A `import type` of the interfaces leaves no trace in a built bundle — the types
disappear at compile time. The runtime helpers below are ordinary values you
import normally; they are pure and register nothing on import.

## Key exports

The interfaces below are types; the package also exports the runtime helpers
noted at the end of the table.

| Export                    | Describes                                                                                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IConfig`                 | A node in the configuration tree: `get`/`getNum`/`getBool` leaf reads, `set`, `getSection`, `getChildren`, `toObject`, `getReloadToken`.                        |
| `IConfigSection`          | An `IConfig` node that also knows its own `key`, `path`, and settable `value` — a sub-tree, not the root.                                                       |
| `IConfigRoot`             | An `IConfig` that owns `providers` and can `reload()` them.                                                                                                     |
| `IConfigBuilder`          | Accumulates `IConfigSource`s via `add()` and turns them into an `IConfigRoot` via `build()`. Exposes a shared `properties` bag for builder↔source coordination. |
| `IConfigManager`          | Both an `IConfigBuilder` and an `IConfig` at once — a mutable object you can keep adding sources to while also reading it live.                                 |
| `IConfigSource`           | A factory: `build(builder)` returns the `IConfigProvider` for this source.                                                                                      |
| `IConfigProvider`         | The read/write backend behind one source: `tryGet`, `set`, `load`, `getChildKeys`, `getReloadToken`.                                                            |
| `ITryGetResult<T>`        | The tuple `[false]` on a miss or `[true, value]` on a hit — the return shape for lookups that need to distinguish "absent" from "present but falsy."            |
| `ConfigObject`            | The nested plain-string-object shape returned by `IConfig.toObject()`.                                                                                          |
| `IndexedSection`          | An `IConfigSection` with an index signature, so `config.Server.Port`-style dot/bracket navigation type-checks on an untyped tree.                               |
| `configPath`              | Runtime helpers for colon-delimited keys: `combine`, `getSectionKey`, `getParentPath`, and the `KeyDelimiter` constant.                                         |
| `ConfigAugmentations`     | Convenience members over an `IConfig`: `getConnectionString`, `getRequiredSection`, `asEnumerable`. Plus the free `exists` predicate.                           |
| `ConfigRootAugmentations` | `getDebugView` over an `IConfigRoot`, and the `ConfigDebugViewContext` shape its callback receives.                                                             |
| `isConfigSection`         | A runtime guard (`x): x is IConfigSection`) that distinguishes a genuine section from a root, backed by a brand the concrete section stamps on itself.          |

Every accessor here is deliberately one-type-per-input: `get` returns a raw
string or a caller-supplied factory's result, `getNum`/`getBool` coerce and
throw rather than silently returning a wrong or `NaN` value, and
`getSection` never returns `null` — an absent section is just an empty one.

## How it fits

`config.core` is the abstractions foundation for the configuration family. It
depends on [`primitives`](../primitives/README.md) for the `IChangeToken`
type used by `getReloadToken()`, and on nothing else.

- [`config`](../config/README.md) is the concrete engine — the builder,
  root, and section tree that actually implement these interfaces, plus
  reload tokens and a runtime schema.
- The source packages — `config.json`, `config.env`, `config.commandline` —
  each implement `IConfigSource`/`IConfigProvider` and register
  themselves onto `IConfigBuilder`/`IConfigManager`.
- [`options.augmentations`](../options.augmentations/README.md) binds an
  `IConfig` section into an `IOptions<T>`, using these same interfaces
  as its input.

If you're building an application, install `@rhombus-std/config` (and the
providers you need) instead — this package is for library authors who need
the shape without the implementation.

## Notes

- Importing this package has no side effects: the runtime helpers it ships
  are pure functions and value objects that register nothing and touch no
  builder. The fluent forms of the augmentation sets are installed by the
  engine package (`@rhombus-std/config`), not here.
- `IConfigManager` is a structural combination (`extends IConfig, IConfigBuilder`) —
  any object satisfying both shapes satisfies it, with no marker or brand required.
