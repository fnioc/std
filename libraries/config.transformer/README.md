# @rhombus-std/config.transformer

**Turns a TypeScript interface into a configuration schema, at compile time.**

`@rhombus-std/config` lets you validate and coerce configuration by hand-writing
a `Schema` object. This package removes that step: it's a build-time transformer
that rewrites `.withType<T>()` on a `ConfigBuilder` into a generated
`.withSchema({...})` call, so a plain interface gives you fully-typed,
fully-coerced configuration with zero hand-written schema.

## Install

```sh
bun add @rhombus-std/config.transformer @rhombus-std/config
```

This package is a build-time-only engine with no JavaScript API of its own — installing it is
the whole setup. It pairs with `@rhombus-std/config`'s opt-in `with-type-augment` import, which
declares `.withType<T>()`; see [Usage](#usage) below.

## Usage

```ts
import { ConfigBuilder } from '@rhombus-std/config';
import '@rhombus-std/config/with-type-augment';

interface ServerConfig {
  host: string;
  port: number;
  ssl?: boolean;
}

const config = new ConfigBuilder()
  .addInMemoryCollection({ host: 'example.com', port: '8443', ssl: 'true' })
  .withType<ServerConfig>() // ← rewritten to .withSchema({ host: "string", … })
  .build();

config.port; // number — coerced at runtime from "8443"
```

`.withType<ServerConfig>()` isn't magic at runtime — this transformer replaces
it, at compile time, with exactly the `.withSchema({...})` call you'd have
written by hand. `@rhombus-std/config` does all the coercion; this package only
generates the schema literal. `.withType` itself lives behind
`@rhombus-std/config`'s opt-in `with-type-augment` import; without this
transformer configured, calling it hits a loud throwing stub at runtime —
never a silent, un-coerced builder.

## What lowers

| Field type                      | Emitted schema                        |
| ------------------------------- | ------------------------------------- |
| `string` / `number` / `boolean` | `"string"` / `"number"` / `"boolean"` |
| nested object / interface       | a nested object literal (recurses)    |
| `foo?: T`                       | `{ [OPTIONAL]: <schema for T> }`      |

Anything without a runtime `Schema` representation — a union (other than
`boolean`), an array/tuple, a function, or a library type like `Date` — is a
**hard compile error**, and the whole `.withType` call is left un-rewritten
(never a silent partial). Property-name casing is preserved exactly (`Host`
stays `Host`). An injected `import { OPTIONAL } from "@rhombus-std/config"` is
added once per file, only when an optional field lowers.

## Key exports

This package has no JavaScript API of its own — it's a build-time-only Go/`ttsc` engine
descriptor, consumed by `ttsc` through its `./ttsc` subpath. There's nothing to import from it
directly; see [Usage](#usage) above for the `.withType<T>()` call it lowers.

## How it fits

`@rhombus-std/config.transformer` is a standalone, build-time-only companion to
[`@rhombus-std/config`](../config/README.md) — it has no dependency-injection
involvement and no runtime footprint of its own; every byte it emits is a call
`@rhombus-std/config` already knows how to run. Install it alongside `config`
whenever you want `.withType<T>()` instead of hand-writing a `Schema`.

## Notes

- The transformer never adds a capability `.withSchema({...})` doesn't already
  have — it only saves you from writing the schema literal yourself. Skipping
  this package and calling `.withSchema()` directly works identically.
- Without this transformer actually running at build time, calling
  `.withType<T>()` compiles fine but throws at runtime — it's a loud stub, not
  a silent no-op.
