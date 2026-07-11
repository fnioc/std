# @rhombus-std/di.transformer.options

A [`@rhombus-std/di.transformer`](../di.transformer) **satellite**: it lowers the
type-driven `addOptions<T>()` sugar to the explicit, transformer-free verb
`addOptions(token(Options<T>), token(T))` that
[`@rhombus-std/options.augmentations`](../options.augmentations) installs on the
registration builder.

```ts
import '@rhombus-std/options.augmentations'; // installs the runtime addOptions verb

// authored:
services.addOptions<AppOptions>().as('singleton');

// lowered (compile time):
services.addOptions(
  '@rhombus-std/options:Options<app:AppOptions>',
  'app:AppOptions',
).as('singleton');
```

The registration wraps the **already-bound** `AppOptions` (resolved from its own
token) in an `Options<AppOptions>` — `addFactory(token, (t) => Options.of(t),
[[tToken]])`. It binds no configuration; that is
`options.augmentations`'s `configure(token, section)` concern.

## Why a `di.transformer` satellite, not `options.transformer`

Pure token-lowering is di's _kind_ of transform (type → token), it emits di
registrations, and it has **zero value without di** — so it lives as a
di.transformer satellite that imports di.transformer's token derivation, rather
than a standalone family transformer. Contrast `config.transformer`, whose
schema-derivation is usable with no di at all, so it stays its own package. See
`docs/decisions.md` §15.

## Usage

Add it to your `tsconfig.json` plugins **alongside** `@rhombus-std/di.transformer`
(order-independent) and compile with `ts-patch` (`tspc`):

```jsonc
{
  "compilerOptions": {
    "plugins": [
      { "transform": "@rhombus-std/di.transformer", "import": "transform" },
      {
        "transform": "@rhombus-std/di.transformer.options",
        "import": "transform",
      },
    ],
  },
}
```
