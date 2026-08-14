# @rhombus-std/di.core

**The dependency-injection abstractions a library depends on to declare registrations, without pulling in a resolution engine.**

`@rhombus-std/di.core` carries the `Manifest` — an immutable registration ledger — the `Type`-addressed registration verbs, the fluent builder those verbs are built from, and the whole error taxonomy a container failure can raise. If you're writing an application, you'll normally install [`@rhombus-std/di`](../di/README.md) instead, which re-exports everything here plus `ServiceProvider`, the engine that actually seals a manifest and resolves against it. Install `di.core` directly when you're authoring a library that needs to _describe_ registrations — a plugin, a set of default services, a test helper — without depending on how they get resolved.

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

const manifest = new DefaultManifest()
  .add(IGreeter, register => register.asClass(ConsoleGreeter).withSignature());
```

The builder lambda (`register => register.asClass(...).withSignature(...)`) chooses an implementation (`asClass`/`asFactory`/`asValue`), then names its call shape — `withSignature(...paramTypes)` for one row of argument types, `withSignatures(...rows)` for several, or `withType(implementerType)` for the whole composed constructor/function type — exactly one of the three, ever — and optionally sets a lifetime scope (`withLifetime`) or a resolution key (`taggedAs`).

The same registration can also be stated in one call, with the implementer's whole composed type given directly: `manifest.addClass(IGreeter, ConsoleGreeter, Type.ctor(IGreeter, [[]]))` — `addClass`/`addFactory`/`addValue` take the implementer's whole composed `Type` as `implementerType` (`Type.ctor(IGreeter, [[]])` for a no-argument constructor, `Type.ctor(IGreeter, [[TypeA, TypeB]])` for one two-argument overload) instead of a builder lambda.

`di.core` alone can declare and inspect a manifest, but has nothing that resolves against one — that's [`@rhombus-std/di`](../di/README.md)'s `build()`.

## Key exports

| Export                                                      | What it is                                                                                                                                                            |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Manifest<Scopes>`                                          | The interface every registration verb works against: an immutable, iterable chain of `ServiceDescriptor`s, newest registration first.                                 |
| `DefaultManifest<Scopes>`                                   | The concrete `Manifest` — start a registration chain with `new DefaultManifest()`.                                                                                    |
| `add` / `addClass` / `addFactory` / `addValue`              | Register a service, either through the fluent builder (`add(type, register => ...)`) or by naming the implementation and its call shape directly.                     |
| `tryAdd` / `tryAddClass` / `tryAddFactory` / `tryAddValue`  | The same verbs, but a no-op when a matching registration (same address, key, and implementation shape) already exists.                                                |
| `replaceClass` / `replaceFactory` / `replaceValue`          | Remove any existing registration under the address (and key), then add the new one.                                                                                   |
| `remove` / `replace` / `removeAll` / `addMany`              | Lower-level descriptor operations: drop or swap one descriptor by identity, drop everything filed under an address, or add several descriptors at once.               |
| `ServiceDescriptor`                                         | The registration primitive. `ServiceDescriptor.ctor` / `.factory` / `.value` construct one directly; `.matches` / `.equals` compare two.                              |
| `Type` (re-exported from `primitives`)                      | The address every registration is filed under — `Type.imported`, `Type.tag`, `Type.array`, and the rest of the factories.                                             |
| `Inject<T, K>`                                              | Pins a constructor parameter's service type to a specific address, overriding what it would otherwise derive from the parameter's own declared type.                  |
| `Hole<N, C>` / `$<N>`                                       | Marks an open-generic slot in a registration template, closed by whatever type the request supplies. `N` numbers the hole; `C` constrains what may close it.          |
| `Keyed<T, K>`                                               | Tags a constructor parameter with a resolution key, distinguishing one registration of a type from another.                                                           |
| `Typeof<T>`                                                 | Marks a constructor parameter that receives `T`'s `Type` itself, rather than a resolved instance of it — for something like a generic logger naming its own category. |
| `DiError`                                                   | The abstract root every container error extends. Catch this to tell a container failure from anything else with one check, without naming which failure it was.       |
| `UnsatisfiableError` / `CycleError` / `AmbiguousUnionError` | Nothing can produce the requested type; a resolution loops back on itself; or a union dependency has more than one candidate and nothing says which.                  |
| `ManifestValidationError`                                   | Raised by an up-front validation pass — carries every registration that failed to lower, not just the first.                                                          |
| `IServiceProvider`                                          | The resolution interface a library depends on to pull services out of a sealed container, without depending on the engine that seals it.                              |
| `IServiceScope` / `IServiceScopeFactory` / `ScopeCache`     | The per-request resolution scope contract.                                                                                                                            |

## How it fits

`@rhombus-std/di.core` depends only on `@rhombus-std/primitives`. If you're building an application, install [`@rhombus-std/di`](../di/README.md) instead — it re-exports everything here plus `ServiceProvider`, the concrete engine. Install `di.core` directly when you're authoring a library that needs to describe registrations — a plugin, a set of default services, a test helper — without depending on how they get resolved.

[`@rhombus-std/di.extras`](../di.extras/README.md) is the companion authoring package: it supplies tokenless (`<T>`-only, no explicit `Type` argument) forms of the verbs above, for a program built through this repo's Go/ttsc transform. `di.core`'s explicit, address-first verbs are the complete, hand-writable API either way.

## Notes

- The manifest is immutable: every verb returns a new `Manifest` rather than mutating the receiver, so `manifest.addClass(...)` alone, with its result discarded, registers nothing — always reassign or chain.
- `IServiceProvider` and `IServiceScope` describe more surface than any implementation has finished yet — several members are declared ahead of the lifetime and disposal model they depend on. `@rhombus-std/di`'s `ServiceProvider` is the concrete implementation; see its README for which members work today.
- A keyed registration composes the key into the address itself (`Type.tag(base, key)`), not as a separate lookup — registering or requesting the same type with a different key names a different address entirely.
