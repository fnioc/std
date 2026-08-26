# @rhombus-std/di.core

**The dependency-injection abstractions a library depends on to declare registrations, without pulling in a resolution engine.**

`@rhombus-std/di.core` carries the `Manifest` — an immutable registration ledger — the `Type`-addressed registration verbs, the fluent builder those verbs are built from, and the whole error taxonomy a container failure can raise. If you're writing an application, you'll normally install [`@rhombus-std/di`](../di/README.md) instead, which pulls this package in and adds the engine that seals a manifest and resolves against it. Install `di.core` directly when you're authoring a library that needs to _describe_ registrations — a plugin, a set of default services, a test helper — without depending on how they get resolved.

## Install

```sh
bun add @rhombus-std/di.core
```

`@rhombus-std/primitives` is a dependency (for `Type` and the augmentation registry) and is pulled in automatically.

## Usage

Every registration is filed under a `Type` address, and every registration verb returns a **new** `Manifest` rather than mutating the receiver — a discarded result registers nothing.

```ts
import { DefaultManifest, Type } from '@rhombus-std/di.core';

interface IGreeter {
  greet(name: string): string;
}
const IGreeter = Type.imported('IGreeter', 'app');

class ConsoleGreeter implements IGreeter {
  greet(name: string) {
    return `Hello, ${name}!`;
  }
}

const manifest = new DefaultManifest<unknown>().add(IGreeter, ConsoleGreeter, Type.ctor(IGreeter, [[]]));
```

`add(address, ctor, ctorType, ...lifetime)` is the flat form — it states a whole registration in one call, `ctorType` carrying the constructor's own parameter signatures so they're read from one place. `manifest.describe(address)` opens the same registration as a chain instead, useful once a lifetime or a key is in play:

```ts
type Lifetime = 'singleton' | 'request';

let manifest = new DefaultManifest<Lifetime>();
manifest = manifest.add(
  manifest.describe(IGreeter).asClass(ConsoleGreeter, Type.ctor(IGreeter, [[]])).withLifetime('singleton'),
);
```

`describe(address)` chooses an implementer through one of the `as*` doors (`asClass`/`asFactory`/`asValue`), then optionally refines it with `withLifetime(lifetime)` and `taggedAs(key)`, in either order. Once a door is taken the chain node _is_ a `Registration` — hand it to `add`/`tryAdd`/`replace`, hold it in a variable, or build several in a helper before registering them together. A lifetime vocabulary that admits `undefined` (like `unknown`) lets the chain skip `withLifetime` entirely; a vocabulary of named lifetimes withholds registration-ness until `withLifetime` is called.

`di.core` alone can declare and inspect a manifest, but has nothing that resolves against one — that's [`@rhombus-std/di`](../di/README.md)'s job.

## Key exports

| Export                                          | What it is                                                                                                                                                                                                                                                                   |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Manifest<Lifetime>`                            | The interface every registration verb works against: an immutable, iterable chain of `Registration`s, newest registration first.                                                                                                                                             |
| `DefaultManifest<Lifetime>`                     | The concrete `Manifest` — start a registration chain with `new DefaultManifest()`.                                                                                                                                                                                           |
| `add` / `tryAdd` / `replace`                    | Register a service, either through the flat form (`add(type, ctor, ctorType, ...lifetime)`, and the matching `factory`/value shapes) or via `describe(type)`'s chain. `tryAdd` is a no-op when the address already has a registration; `replace` swaps out the existing one. |
| `addValue` / `tryAddValue` / `replaceValue`     | The value-registering shapes as their own verbs — the door that forces a callable down the value path instead of being read as a factory.                                                                                                                                    |
| `describe(address)`                             | Opens a registration chain for `address`: an `as*` door chooses the implementer, `withLifetime`/`taggedAs` refine it, and the result is a `Registration`.                                                                                                                    |
| `remove` / `removeAll` / `addMany` / `apply`    | Lower-level registration operations: drop one registration or every registration under an address, or fold several registrations in at once.                                                                                                                                 |
| `Registration`                                  | The registration primitive. `Registration.ctor` / `.factory` / `.value` construct one directly; `.matches` / `.equals` compare two.                                                                                                                                          |
| `Type` (re-exported from `primitives`)          | The address every registration is filed under — `Type.imported`, `Type.tag`, `Type.ctor`, and the rest of the factories.                                                                                                                                                     |
| `Inject<T, K>`                                  | Pins a constructor parameter's address, overriding what it would otherwise derive from the parameter's own declared type.                                                                                                                                                    |
| `Generic<L, C>`                                 | Marks an open-generic slot in a registration template, closed by whatever type the request supplies. `L` labels the hole so several can be told apart; `C` constrains what may close it.                                                                                     |
| `Keyed<T, K>`                                   | Tags a constructor parameter with a resolution key, distinguishing one registration of a type from another.                                                                                                                                                                  |
| `Typeof<T>`                                     | Marks a constructor parameter that receives `T`'s `Type` itself, rather than a resolved instance of it — for something like a generic logger naming its own category.                                                                                                        |
| `IServiceProvider`                              | The resolution interface a library depends on to pull services out of a sealed container: `getService(address)`, throwing when nothing can produce it — plus the `resolve(address)` / `resolveMany(address)` augmentations `di.core` layers on top of it.                    |
| `LifetimeModel<Lifetime>`                       | The scope/lifetime pattern a container runs on. `LifetimeModel.noop` is the built-in model that retains nothing — every registration is constructed fresh every time.                                                                                                        |
| `ScopeFactory<Args>`                            | The interface a lifetime model publishes under `ScopeFactory.address` when it supports opening scopes — resolving that address hands back the opener itself.                                                                                                                 |
| `DiError`                                       | The abstract root every container error extends. Catch this to tell a container failure from anything else with one check, without naming which failure it was.                                                                                                              |
| `UnsatisfiableError` / `CycleError`             | Nothing can produce the requested type; or a resolution loops back on itself.                                                                                                                                                                                                |
| `LifetimeModelError` / `ScopeTagUnmatchedError` | The installed lifetime model threw while realizing a service; or a registration is kept by a scope tag that no open scope carries.                                                                                                                                           |
| `ManifestValidationError` / `ValidationFailure` | Raised by an up-front validation pass — carries every registration that failed to lower, not just the first.                                                                                                                                                                 |

## How it fits

`@rhombus-std/di.core` depends only on `@rhombus-std/primitives`. If you're building an application, install [`@rhombus-std/di`](../di/README.md) instead — it pulls this package in and adds `ServiceProvider`, the concrete engine that seals a manifest and resolves against it. Install `di.core` directly when you're authoring a library that needs to describe registrations — a plugin, a set of default services, a test helper — without depending on how they get resolved.

[`@rhombus-std/di.extras`](../di.extras/README.md) is the companion authoring package: it supplies type-argument-derived forms of the verbs above (`add<T>(...)` instead of `add(typeof T, ...)`), for a program built through this repo's Go/ttsc transform. `di.core`'s explicit, address-first verbs are the complete, hand-writable API either way.

## Notes

- The manifest is immutable: every verb returns a new `Manifest` rather than mutating the receiver, so `manifest.add(...)` alone, with its result discarded, registers nothing — always reassign or chain.
- A keyed registration composes the key into the address itself (`Type.tag(base, key)`, what `taggedAs(key)` does on a `describe` chain), not as a separate lookup — registering or requesting the same type with a different key names a different address entirely.
- `IServiceProvider` describes exactly one member — `getService(address)` — so an implementation has nothing partially finished to work around; `di.core` itself layers `resolve(address)` and `resolveMany(address)` on top of it as augmentations, so both are available on any `IServiceProvider` without depending on the resolution engine that built one.
