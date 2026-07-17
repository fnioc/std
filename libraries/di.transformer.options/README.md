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

services.addOptions(
  '@rhombus-std/options:IOptions<app:AppOptions>',
  'app:AppOptions',
).as('singleton');
```

Writing that wrapper token out by hand is what this plugin exists to remove.
Wire it into your `tsconfig.json` **alongside** `@rhombus-std/di.transformer`
(the two plugins compose; order between them doesn't matter), and compile
with `ts-patch`'s patched compiler (`tspc`):

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

With the plugin in the program, you write:

```ts
services.addOptions<AppOptions>().as('singleton');
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

| Export                                            | What it is                                                                                                |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `transform` / `transformer` (default)             | The ts-patch transformer factory — point your tsconfig `plugins` entry's `"import"` at `transform`.       |
| `createTransformerFactory`                        | The underlying factory, exposed directly for tests or custom driving code.                                |
| `Diagnostic`, `DiagnosticCode`, `IDiagnosticSink` | The plugin's diagnostic surface — stable codes you can assert on in tooling, independent of message text. |

Importing the package also carries a type-only side effect: it declares the
`addOptions<T>()` overload on the registration builder. Without this package
in your program, `addOptions<T>()` simply doesn't exist as a method — there's
no silent no-op form waiting to compile-but-misbehave under plain `tsc`.

## How it fits

- Builds on [`@rhombus-std/di.transformer`](../di.transformer) for its token
  derivation — this plugin never touches the DI runtime directly, only types
  and tokens.
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

- This plugin has no effect under plain `tsc` — `addOptions<T>()` only exists
  once the plugin is in your `tsconfig.json` `plugins` array and you compile
  with `tspc`. There is deliberately no runtime fallback for the 0-argument
  form.
- It emits diagnostics (not silent skips) when a type argument's token can't
  be derived, or when `@rhombus-std/options`'s `IOptions<T>` isn't reachable
  in your program.
