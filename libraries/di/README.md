# @rhombus-std/di

**The dependency-injection engine — choose a lifetime model, seed it with a `Manifest`, and seal the result into a `ServiceProvider` you resolve services out of.**

`@rhombus-std/di` builds on [`@rhombus-std/di.core`](../di.core/README.md) — the `Manifest` registration surface and the error taxonomy — adding the genesis front door (`di.usingLifetimeModel(...)`) and the concrete `ServiceProvider` it produces. Install this at your application's composition root, the place that actually builds the container. A library that only needs to declare registrations or accept an already-built `IServiceProvider` should depend on `di.core` alone.

## Install

```sh
bun add @rhombus-std/di
```

`@rhombus-std/di.core` and `@rhombus-std/primitives` are dependencies and are pulled in automatically.

## Usage

```ts
import { di } from '@rhombus-std/di';
import { LifetimeModel, Manifest, Type } from '@rhombus-std/di.core';

interface IGreeter {
  greet(name: string): string;
}
const IGreeter = Type.imported('IGreeter', 'app');

class ConsoleGreeter implements IGreeter {
  greet(name: string) {
    return `Hello, ${name}!`;
  }
}

const manifest = Manifest.empty<unknown>().add(IGreeter, ConsoleGreeter, Type.ctor(IGreeter, [[]]));

const provider = di.usingLifetimeModel(LifetimeModel.noop)
  .usingManifest(manifest)
  .build();

provider.resolve(IGreeter).greet('world'); // "Hello, world!"
```

`di.usingLifetimeModel(model)` is the one entry point: it opens a `ContainerBuilder` running on `model`'s scope/lifetime behavior. `.usingManifest(manifest)` seeds the builder from an existing registration stream (discarding whatever was configured before it); `.configureServices(configure)` composes registrations onto the manifest instead, one delegate per call, each receiving the previous step's result; `.configureProvider(configure)` composes `ServiceProviderOptions` the same way. `.build()` seals everything into a `ServiceProvider`. Every builder method returns a **new** `ContainerBuilder`, so — exactly like `Manifest` itself — a discarded result configures nothing.

`resolve(address)` and `resolveMany(address)` are `di.core`'s own augmentations on `IServiceProvider`, so they're available the moment `di.core` is loaded — which it always is, since `di` depends on it.

## Key exports

| Export                                                                                                              | What it is                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `di`                                                                                                                | The genesis namespace — `di.usingLifetimeModel(model)` opens a `ContainerBuilder` running on `model`.                                                                            |
| `ContainerBuilder<Lifetime>`                                                                                        | Assembles a provider: `usingManifest` / `configureServices` compose the manifest, `configureProvider` composes the build options, `build()` seals it into an `IServiceProvider`. |
| `ServiceProvider`                                                                                                   | The concrete engine `build()` returns: resolves services against the sealed manifest and lifetime model.                                                                         |
| `ServiceProviderOptions`                                                                                            | Build-time behavior: `validateOnBuild` lowers every closed registration while building, so an unsatisfiable graph fails at the build instead of at some later resolution.        |
| `DiError`, `UnsatisfiableError`, `CycleError`, `LifetimeModelError`, `ManifestValidationError`, `ValidationFailure` | Re-exported from `di.core` — the same classes, so `instanceof` holds whichever package a caller imports the taxonomy from.                                                       |

## How it fits

`@rhombus-std/di` depends on [`@rhombus-std/di.core`](../di.core/README.md) for the `Manifest`/`Registration`/`LifetimeModel` surface and `@rhombus-std/primitives` for `Type` and the augmentation registry. It re-exports the whole `di.core` error taxonomy, so code that already imports the engine doesn't need a second import from the abstractions package just to catch what it throws.

[`@rhombus-std/di.extras`](../di.extras/README.md) supplies type-argument-derived (`<T>`-only) authoring sugar for the registration verbs, for a program built through this repo's Go/ttsc transform; `di` and `di.core` work identically without it.

## Notes

- A discarded `.add(...)`, `.describe(...)`, or `.configureServices(...)` result configures nothing — both `Manifest` and `ContainerBuilder` are immutable, so always chain or reassign.
- A union dependency settles deterministically: a registration for the union's own address answers it outright; otherwise each member is tried, registration then synthesis, in the union's canonical order, and the first one that resolves settles it. Literals order last among members, which is what keeps a literal member (such as `undefined`) as the fallback of an optional dependency.
- `LifetimeModel.noop`, from `di.core`, retains nothing: every registration is constructed fresh on every resolution, and it never opens a scope. A model that scopes publishes the capability to open one under `ScopeFactory.address`, resolved like any other service.
