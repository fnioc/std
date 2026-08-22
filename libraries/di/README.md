# @rhombus-std/di

**The dependency-injection engine — seal a `Manifest` into a `ServiceProvider` and resolve services out of it.**

`@rhombus-std/di` re-exports everything in [`@rhombus-std/di.core`](../di.core/README.md) — the `Manifest` registration surface and the error taxonomy — plus `ServiceProvider`, the concrete engine that seals a manifest and answers resolution requests against it. Install this at your application's composition root, the place that actually builds the container. A library that only needs to declare registrations or accept an already-built `IServiceProvider` should depend on `di.core` alone.

## Install

```sh
bun add @rhombus-std/di
```

`@rhombus-std/di.core` and `@rhombus-std/primitives` are dependencies and are pulled in automatically.

## Usage

```ts
import '@rhombus-std/di'; // unlocks .build() on Manifest
import type { ServiceProvider } from '@rhombus-std/di';
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

const provider: ServiceProvider = new DefaultManifest()
  .add(IGreeter, register => register.asClass(ConsoleGreeter).withSignature())
  .build();

provider.getRequiredService(IGreeter).greet('world'); // "Hello, world!"
```

`build()` is the one verb `di` adds to every `Manifest` — everything up to that point is [`di.core`](../di.core/README.md)'s registration surface. `getService(type)` returns `undefined` when nothing is registered; `getRequiredService(type)` throws; `getServices(type)` returns every registration of a type as an iterable, empty rather than throwing or returning `undefined` when nothing matches.

## Key exports

| Export                                                                                        | What it is                                                                                                                     |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `ServiceProvider`                                                                             | The concrete engine: seals a `Manifest` (via `build()`) and resolves services against it.                                      |
| `build()`                                                                                     | The `Manifest` verb this package adds — `manifest.build(options?)` returns a `ServiceProvider`.                                |
| `ServiceProviderOptions`                                                                      | Build-time behavior: `validateOnBuild` (fail at build instead of at first resolve), `validateScopes` (declared, not yet read). |
| `getService(type)` / `getRequiredService(type)` / `getServices(type)`                         | Resolve one optional service, one required service, or every registration of a type.                                           |
| `DiError`, `UnsatisfiableError`, `CycleError`, `ManifestValidationError`, `ValidationFailure` | Re-exported from `di.core` — the same classes, so `instanceof` holds whichever package a caller imports the taxonomy from.     |

## How it fits

`@rhombus-std/di` depends on [`@rhombus-std/di.core`](../di.core/README.md) for the `Manifest`/`ServiceDescriptor` surface and `@rhombus-std/primitives` for `Type` and the augmentation registry. It re-exports the whole `di.core` error taxonomy, so code that already imports the engine doesn't need a second import from the abstractions package just to catch what it throws.

[`@rhombus-std/di.extras`](../di.extras/README.md) supplies tokenless (`<T>`-only) authoring sugar for the registration verbs, for a program built through this repo's Go/ttsc transform; `di` and `di.core` work identically without it.

## Notes

- `ServiceProvider`'s `tryResolve`, `resolveAsync`, `dispose`, and `disposeAsync` are declared but not implemented yet — each throws `NotImplementedError`, ahead of the lifetime and disposal model they depend on. `getService`, `getRequiredService`, `getServices`, and `createScope` all work today.
- A discarded `.add(...)` / `.addClass(...)` / etc. result registers nothing — the manifest is immutable, so always chain or reassign (see [`di.core`](../di.core/README.md)).
- A union dependency settles deterministically: a registration for the union's own address answers it outright; otherwise the members are tried in the union's canonical order, every member's registrations before any member's synthesis. Literals order last among members, which is what keeps a literal member (such as `undefined`) as the fallback of an optional dependency.
