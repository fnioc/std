# @rhombus-std/di.extras

**Authoring-time sugar for `@rhombus-std/di.core`'s registration verbs — the tokenless forms a program built through this repo's Go/ttsc transform can write.**

`di.extras` has no runtime behavior you call directly. It declares the tokenless typings (`addClass<T>(ctor, signatures)` instead of `addClass(type, ctor, signatures)`) that let those calls typecheck, and it's the source the repo's transform reads at build time to substitute the equivalent, address-first call at each site. A program that doesn't run through the transform can ignore this package entirely — `di.core`'s explicit, address-first verbs are the complete, hand-writable API on their own.

## Install

```sh
bun add -D @rhombus-std/di.extras
```

Add it as a **devDependency**, alongside `@rhombus-std/di.core` as a regular dependency — `di.extras` contributes no code to your published bundle; it only needs to be present so the transform can find its sugar bodies and so the tokenless typings are in scope while you write.

## Usage

With `di.extras` installed, this typechecks and, when built through the repo's Go/ttsc transform, substitutes to the explicit call beneath it:

```ts
import { typefor } from '@rhombus-std/primitives.extras';

manifest.addClass<IGreeter>(ConsoleGreeter, typefor<typeof ConsoleGreeter>());
```

```ts
// what the above substitutes to, and what a no-transformer author writes by hand instead
import { Type } from '@rhombus-std/di.core';

manifest.addClass(Type.imported('IGreeter', 'app'), ConsoleGreeter,
  Type.ctor(Type.imported('ConsoleGreeter', 'app'), [[]]));
```

`addClass<T>(...)` derives the registration address from `T` instead of an explicit `Type` argument — the sugar elides only that one argument, forwarding everything after it positionally. The implementation type stays a call you write either way: `typefor<typeof ConsoleGreeter>()` derives the `Type.ctor(...)` node a hand-writer would compose, straight from `ConsoleGreeter`'s own construct signature. Both throw if called without the transform having run — they exist to be substituted, not executed.

## Key exports

| Export                                | What it is                                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ManifestDescriptorAugmentations`     | The tokenless bodies for `tryAdd`, `tryAddClass`/`tryAddFactory`/`tryAddValue`, `replaceClass`/`replaceFactory`/`replaceValue`, and `removeAll`. |
| `ManifestServiceAugmentations`        | The tokenless bodies for `add`, `addClass`, `addFactory`, and `addValue`.                                                                        |
| `ServiceProviderServiceAugmentations` | The tokenless body backing `resolve`/`getRequiredService`/`getServices` on `IServiceProvider`.                                                |

`di.extras` carries no primitive of its own: every body above imports `typefor<T>()` from [`@rhombus-std/primitives.extras`](../primitives.extras/README.md) to derive the address `T` names, then forwards its remaining arguments untouched.

These three augmentation sets aren't meant to be called directly — they're what the transform's marker roster (`package.json`'s `"rhombus-std": { "inline": { "entries": [...] } }`) points at as each tokenless verb's source body.

## How it fits

`di.extras` peers on [`@rhombus-std/di.core`](../di.core/README.md) — never on the `@rhombus-std/di` runtime engine, so depending on `di.extras` never pulls in a resolution engine your library doesn't otherwise need. It depends on `@rhombus-std/primitives.extras` for `typefor<T>()`, the primitive its sugar bodies derive an address from.

[`@rhombus-std/di.extras.options`](../di.extras.options/README.md) is a satellite of this package, lowering the separate `addOptions<T>()` sugar the same way.

## Notes

- Every substitution is byte-for-byte what a no-transformer author would have written by hand — the transform deletes boilerplate, never adds a capability or changes behavior.
- `typefor` throws at runtime if the transform never ran — a program that has `di.extras` as a devDependency but doesn't build through the repo's Go/ttsc transform will typecheck cleanly and then fail the first time one of these calls executes.
