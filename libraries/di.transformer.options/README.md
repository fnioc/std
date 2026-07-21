# @rhombus-std/di.transformer.options

**A compile-time plugin that turns `addOptions<T>()` into a fully-typed
options registration — no manual tokens to write.**

It's a small satellite of [`@rhombus-std/di.transformer`](../di.transformer):
where that plugin lowers `add<T>()` and friends, this one lowers the
options-specific sugar `addOptions<T>()` to the explicit registration verb
that [`@rhombus-std/options.augmentations`](../options.augmentations)
installs at runtime.

## Install

```sh
bun add @rhombus-std/di.transformer.options
bun add @rhombus-std/di.core @rhombus-std/di.transformer @rhombus-std/options.augmentations
```

## Usage

Without this plugin, registering an `IOptions<T>` by hand looks like this —
this is the real, complete form, and it works with plain `tsc`:

```ts
import '@rhombus-std/options.augmentations'; // installs the runtime addOptions verb

services = services.addOptions(
  '@rhombus-std/options:IOptions<app:AppOptions>',
  'app:AppOptions',
).as('singleton');
```

Writing that wrapper token out by hand is what this plugin exists to remove. Importing
`@rhombus-std/di.transformer.options` (or listing it in your `tsconfig.json`'s `types` array)
brings the 0-argument sugar into scope for typechecking, alongside `@rhombus-std/di.transformer`
(the two compose; order doesn't matter). With both in scope, you write:

```ts
services = services.addOptions<AppOptions>().as('singleton');
```

and it compiles to exactly the explicit call above — the plugin derives both
tokens from the `AppOptions` type argument and rewrites the call before your
code ever runs. Nothing about behavior changes; the plugin only saves you
from typing the tokens yourself.

The registration wraps the already-bound `AppOptions` value (resolved from
its own token) in an `IOptions<AppOptions>`. It binds no configuration on its
own — pairing an options section with a configuration source is
`options.augmentations`'s `configure(token, section)` job, not this
plugin's.

## Key exports

This package has no JavaScript API of its own — like `@rhombus-std/config.transformer` and
`@rhombus-std/primitives.transformer`, it's a build-time-only Go/`ttsc` engine descriptor.
Importing it (or listing it in your `tsconfig.json`'s `types` array) carries a type-only side
effect instead: it declares the `addOptions<T>()` overload on the registration builder. Without
this package in your program, `addOptions<T>()` simply doesn't exist as a method — there's no
silent no-op form waiting to compile-but-misbehave under plain `tsc`.

## How it fits

- Depends on [`@rhombus-std/primitives.transformer`](../primitives.transformer) for its token
  derivation, the same engine [`@rhombus-std/di.transformer`](../di.transformer) depends on — this
  plugin never touches the DI runtime directly, only types and tokens.
- Targets the explicit registration verb that
  [`@rhombus-std/options.augmentations`](../options.augmentations) installs
  on the registration builder; install that package for the runtime side of
  `addOptions`.
- Sits alongside [`@rhombus-std/di.core`](../di.core) (the registration
  builder interface it extends) and [`@rhombus-std/options`](../options)
  (home of the `IOptions<T>` type it wraps values in).
- Install it whenever you use `addOptions<T>()`'s type-argument form; skip it
  entirely and call `addOptions(token, tToken)` by hand if you'd rather not
  add a build plugin.

## Notes

- This plugin's type augmentation has no effect unless it's in scope (via import or the `types`
  array, described above) — `addOptions<T>()` doesn't exist as a method otherwise. There is
  deliberately no runtime fallback for the 0-argument form; the actual token rewrite still needs
  the build-time engine to run.
- It emits diagnostics (not silent skips) when a type argument's token can't
  be derived, or when `@rhombus-std/options`'s `IOptions<T>` isn't reachable
  in your program.
