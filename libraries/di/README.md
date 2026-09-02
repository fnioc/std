# @rhombus-std/di

**The dependency-injection engine — open a `Builder` chain, feed it addons and registrations, and seal the result into a provider you resolve services out of.**

`@rhombus-std/di` builds on [`@rhombus-std/di.core`](../di.core/README.md) — the `Manifest` registration surface and the error taxonomy — adding the genesis front door (`Builder.useAddon(...)` / `Builder.withServices(...)`) and the concrete provider it produces. Install this at your application's composition root, the place that actually builds the container. A library that only needs to declare registrations or accept an already-built `IServiceProvider` should depend on `di.core` alone.

## Install

```sh
bun add @rhombus-std/di
```

`@rhombus-std/di.core` and `@rhombus-std/primitives` are dependencies and are pulled in automatically.

## Usage

```ts
import { Builder } from '@rhombus-std/di';
import { Manifest, Type } from '@rhombus-std/di.core';

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

const provider = Builder.withServices(() => manifest).build();

provider.resolve(IGreeter).greet('world'); // "Hello, world!"
```

`Builder.useAddon(addon)` and `Builder.withServices(fn)` open the chain, and the same two verbs extend it. `useAddon` installs an addon: its registrations file in call order, and its middleware composes into the resolution chain at that call's position. `withServices` installs the registrations a delegate composes onto an empty manifest, as an addon with no middleware of its own. The first input carrying a concrete lifetime vocabulary locks the chain onto it, and every addon after that must speak the same one. `.build()` seals everything into a provider; an ask nothing in the manifest answers throws `UnsatisfiableError`. Every verb returns a **new** `Builder`, so — exactly like `Manifest` itself — a discarded result configures nothing.

`resolve(address)` and `resolveMany(address)` are `di.core`'s own augmentations on `IServiceProvider`, so they're available the moment `di.core` is loaded — which it always is, since `di` depends on it.

## Key exports

| Export                                                                                                                 | What it is                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Builder`                                                                                                              | The one entry point: `Builder.useAddon(...)` / `Builder.withServices(...)` open a chain, `useAddon` / `withServices` extend it, and `build()` seals it into an `IServiceProvider`.                                            |
| `validateUniversalAddresses`, `validateBuildability`                                                                   | Validation addons: the first rejects a registration addressed by nothing but a hole, the second plans every closed address while building — so an unsatisfiable graph fails at the build instead of at some later resolution. |
| `DiError`, `UnsatisfiableError`, `CycleError`, `ManifestValidationError`, `UniversalAddressError`, `ValidationFailure` | Re-exported from `di.core` — the same classes, so `instanceof` holds whichever package a caller imports the taxonomy from.                                                                                                    |

## How it fits

`@rhombus-std/di` depends on [`@rhombus-std/di.core`](../di.core/README.md) for the `Manifest`/`Registration`/`Addon` surface and `@rhombus-std/primitives` for `Type` and the augmentation registry. It re-exports the whole `di.core` error taxonomy, so code that already imports the engine doesn't need a second import from the abstractions package just to catch what it throws.

[`@rhombus-std/di.extras`](../di.extras/README.md) supplies type-argument-derived (`<T>`-only) authoring sugar for the registration verbs, for a program built through this repo's Go/ttsc transform; `di` and `di.core` work identically without it.

## Notes

- A discarded `.add(...)`, `.describe(...)`, or `.withServices(...)` result configures nothing — both `Manifest` and `Builder` are immutable, so always chain or reassign.
- The engine seeds two registrations of its own, filed oldest so yours shadow them: `IServiceProvider` — a factory answering a fresh view that forwards to the provider that opened the ask — and `ControlService`, the control surface a middleware resolves at fold time for the registry and the two hook verbs (`stageHooks`/`installHooks`, each answering a disposable `Handle`). A factory slot typed `ServiceRequest` (or the base `Request`) receives the live ask itself.
- A registration whose own slot names its own address resolves that slot from what it shadows — a factory for `IFoo` shaped `Func<[IFoo], IFoo>` decorates the older `IFoo` registration, with no decorator verb. Nothing older makes the ask unsatisfiable; a collection ask still enumerates decorator and shadowed both.
- A union dependency settles deterministically: a registration for the union's own address answers it outright; otherwise each member is tried, registration then synthesis, in the union's canonical order, and the first one that resolves settles it. Literals order last among members, which is what keeps a literal member (such as `undefined`) as the fallback of an optional dependency.
