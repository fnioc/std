# @rhombus-std/config.transformer

The `@rhombus-std/config` [ts-patch](https://github.com/nonara/ts-patch) transformer. It
lowers `.withType<T>()` on a `ConfigurationBuilder` into a generated
`.withSchema({...})` runtime schema literal at compile time — so a plain
interface gives you fully-typed, fully-coerced configuration with **zero
hand-written schema**.

```ts
import { ConfigurationBuilder } from "@rhombus-std/config";
import "@rhombus-std/config/with-type-augment";

interface ServerConfig {
  host: string;
  port: number;
  ssl?: boolean;
}

const config = new ConfigurationBuilder()
  .addInMemoryCollection({ host: "example.com", port: "8443", ssl: "true" })
  .withType<ServerConfig>() // ← rewritten to .withSchema({ host: "string", … })
  .build();

config.port; // number — coerced at runtime from "8443"
```

The runtime (`@rhombus-std/config`) owns all coercion; this package only
synthesizes the `Schema` literal `withType<T>()` stands in for. `.withType`
itself is `@rhombus-std/config`'s opt-in Tier 2 authoring surface (`import
"@rhombus-std/config/with-type-augment"`); without this transformer configured,
calling it hits a loud throwing stub — never a silent, un-coerced builder.

## Setup

Install alongside `@rhombus-std/config` and wire the plugin into your
`tsconfig.json`, then compile with `tspc` (ts-patch's patched compiler):

```jsonc
{
  "compilerOptions": {
    "plugins": [
      { "transform": "@rhombus-std/config.transformer", "import": "transform" },
    ],
  },
}
```

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
stays `Host`). An injected `import { OPTIONAL } from "@rhombus-std/config"` is added
once per file only when an optional field lowers.
