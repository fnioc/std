# @rhombus-std/config

**Configuration that knows its own shape.**

Declare a TypeScript interface once. Get a fully-typed, fully-coerced config
object back — merged from JSON files, environment variables, and CLI flags —
with zero hand-written schema and zero reflection.

```ts
import { ConfigurationBuilder } from '@rhombus-std/config';
import '@rhombus-std/config/with-type-augment';
import '@rhombus-std/config.json';
import '@rhombus-std/config.env';
import '@rhombus-std/config.commandline';

interface AppConfig {
  Server: { Host: string; Port: number; Ssl?: boolean; };
  Database: { Primary: { Host: string; PoolSize: number; }; };
}

const config = new ConfigurationBuilder()
  .addJsonFile('appsettings.json')
  .addJsonFile('appsettings.Development.json', { optional: true })
  .addEnvironmentVariables({ prefix: 'APP_' })
  .addCommandLine(process.argv.slice(2))
  .withType<AppConfig>() // ← generates the schema from your interface. that's it.
  .build();

config.Server.Port; // number — typed AND coerced from the string "8080"
config.Database.Primary.Host; // string
```

No `z.object({...})` to keep in sync. No class wall of decorators. No codegen
step to remember to run. `AppConfig` is both the type you already wanted and
the schema `@rhombus-std/config` validates against — `.withType<AppConfig>()`
is compiled away into a `.withSchema({...})` literal by
`@rhombus-std/config.transformer`, a ts-patch plugin, so there's nothing left
to run at build time beyond `tspc` itself.

## Features

- **Your interface is the schema.** `.withType<AppConfig>()` derives
  validation and coercion straight from a TypeScript interface — no
  decorators, no reflect-metadata, no hand-written schema object.
- **Layered sources, last one wins.** In-memory defaults → JSON files (with
  optional overlays) → environment variables (prefixed, `__`-nested) → CLI
  flags. Deterministic precedence, every time.
- **Three tiers, nobody's forced.** Full transformer, a hand-written schema,
  or ad-hoc coercion helpers — pick per project, or mix per key.
- **One type per accessor.** No `string | number | undefined` unions to
  narrow. `getSection()` never returns null.
- **Honest by design.** Config is strings under the hood. You get numbers and
  booleans only where you asked for them — never a silent, wrong coercion.
- **Zero build step, by default.** The no-transformer path is pure runtime.
  Add the transformer only when you want compile-time-derived typing.

## Install

```sh
bun add @rhombus-std/config

# providers — install only the sources you actually use
bun add @rhombus-std/config.json @rhombus-std/config.env @rhombus-std/config.commandline

# optional — powers .withType<T>() for schema-free full typing
bun add @rhombus-std/config.transformer
```

Providers register their `add*` builder methods via side-effect import:

```ts
import '@rhombus-std/config.json';
import '@rhombus-std/config.env';
import '@rhombus-std/config.commandline';
```

`@rhombus-std/config` ships the builder, the merge engine, and the in-memory
source (`addInMemoryCollection`) on its own — everything else is opt-in.

## Fully-typed config, zero schema code

This is the whole point of the library. Write the interface you'd want
anyway; `.withType<AppConfig>()` reads it and builds the schema for you.

`appsettings.json`:

```json
{
  "Server": { "Host": "0.0.0.0", "Port": 8080 },
  "Database": { "Primary": { "Host": "db.internal", "PoolSize": 10 } }
}
```

```ts
config.Server.Ssl; // boolean | undefined — matches `Ssl?` in AppConfig
config.Database.Primary.PoolSize; // number — coerced from 10
```

Required a key your interface says isn't optional? You find out at startup,
not three functions deep into a request handler:

```ts
// appsettings.json is missing Database.Primary.PoolSize
const config = new ConfigurationBuilder()
  .addJsonFile('appsettings.json')
  .withType<AppConfig>()
  .build();
// throws SchemaCoercionError at build(), naming every missing/invalid key at
// once — not silently `undefined` at 2am
```

`.withType<T>()` only exists once you `import
"@rhombus-std/config/with-type-augment"` — calling it without that import is
a compile error, never a silent no-op. And it only does anything once you
compile with `tspc` (ts-patch's patched compiler) and wire
`@rhombus-std/config.transformer` into `tsconfig.json`'s `plugins`; under
plain `tsc` the call reaches a throwing runtime stub instead of silently
skipping validation:

```jsonc
{
  "compilerOptions": {
    "plugins": [
      { "transform": "@rhombus-std/config.transformer", "import": "transform" },
    ],
  },
}
```

The transformer supports `string` / `number` / `boolean` leaves, nested
object types, and `foo?: T` optional fields — anything else (a non-boolean
union, an array, a function, a library type like `Date`) is a compile error
naming the offending field, not a silent partial schema.

## Layered sources, last one wins

Every `add*` call stacks a layer. Layers merge left to right — later sources
overwrite matching keys, everything else merges through untouched.

```ts
import '@rhombus-std/config.json';
import '@rhombus-std/config.env';
import '@rhombus-std/config.commandline';

const config = new ConfigurationBuilder()
  .addInMemoryCollection({ 'Server:Port': '3000' }) // 1. baseline defaults
  .addJsonFile('appsettings.json') // 2. checked-in config
  .addJsonFile('appsettings.Development.json', { optional: true }) // 2b. overlay, ok if absent
  .addEnvironmentVariables({ prefix: 'APP_' }) // 3. env vars, prefix stripped
  .addCommandLine(process.argv.slice(2), {
    '-p': 'Server:Port',
    '-h': 'Server:Host',
  }) // 4. short flags, highest wins
  .build();
```

Environment variables nest with a double underscore:

```sh
APP_SERVER__PORT=8080                     # → Server:Port
APP_DATABASE__PRIMARY__HOST=db.internal   # → Database:Primary:Host
```

And a CLI flag beats all of it:

```sh
node app.js --Server:Port=9090
node app.js -p 9090      # same key, via the switchMappings passed to addCommandLine
```

## Three tiers, nobody's forced

The transformer is the fast path — not the only path.

**Tier 2 — the transformer.** Covered above: your interface generates the
schema.

**Tier 1 — hand-write the schema once.**

```ts
import { ConfigurationBuilder, OPTIONAL } from '@rhombus-std/config';

const config = new ConfigurationBuilder()
  .addJsonFile('appsettings.json')
  .withSchema({
    Server: { Host: 'string', Port: 'number', Ssl: { [OPTIONAL]: 'boolean' } },
  })
  .build();

config.Server.Port; // number — same typed, coerced tree as the transformer path
```

**Tier 0 — skip the schema, coerce ad hoc.**

```ts
const config = new ConfigurationBuilder()
  .addJsonFile('appsettings.json')
  .build();

config.getNum('Server:Port'); // number
config.getNum('Server:Port', 3000); // number, defaulted if the key is absent
config.getBool('Server:Ssl'); // boolean — accepts true/1/yes/on
config.get('Cors:Origins', (s) => s.split(',')); // any shape, via a factory function
config.get('Server:Host'); // raw string, no coercion
```

Same builder, same sources — just a different amount of ceremony. Mix tiers
across a single config tree if that's what the project needs.

## Ergonomic, deterministic navigation

```ts
config.Server.Port; // dot access, typed
config['Server']['Port']; // bracket access, identical value
config.getSection('Server').getNum('Port'); // chainable, scoped access

// getSection never returns null — an absent section is just an empty one.
config.getSection('Does:Not:Exist').get('Key'); // undefined, not a thrown error
```

Every accessor returns exactly one type. `getNum` returns `number` — never
`number | undefined`, never a silent `NaN`.

## Honest by design

Underneath, configuration is a flat map of strings — because that's what
JSON values, env vars, and CLI args actually are. `@rhombus-std/config`
doesn't pretend otherwise. You get a `number` or a `boolean` only at the
exact point you ask for one: through your interface, a hand-written schema,
or an explicit `getNum`/`getBool` call.

```ts
config.getNum('Server:Port'); // "8080"    → 8080
config.getNum('Server:Host'); // "0.0.0.0" → throws. not numeric, not NaN, not a guess.
```

No implicit coercion, no truthy/falsy guessing, no `parseInt` landmines.

## Zero required build step

Skip the transformer and there's nothing to run before `build()` — every
source is read, merged, and coerced at runtime, on every process start. Add
`@rhombus-std/config.transformer` when (and only when) you want
`.withType<T>()` to save you from writing `.withSchema({...})` yourself.

## Key exports

| Export                                                             | What it is                                                                                               |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `ConfigurationBuilder`                                             | Stacks sources into layers; `.withSchema()`/`.withType<T>()` + `.build()`.                               |
| `ConfigurationManager`                                             | A builder and a live, already-built config in one — `.set()` works before any source is added.           |
| `ConfigurationRoot`, `ConfigurationSection`                        | The built, navigable config tree — dot/bracket access, `getSection`, reload tokens.                      |
| `ConfigurationProvider`                                            | Abstract base a configuration source's provider extends.                                                 |
| `addInMemoryCollection`                                            | Bundled in-memory source — set config values directly, no file or env involved.                          |
| `addConfiguration`                                                 | Wraps an already-built `IConfiguration` as a source layer inside another builder.                        |
| `Schema`, `Infer`, `OPTIONAL`                                      | The hand-written schema surface (Tier 1) — `Infer<S>` gives you the resulting TypeScript type.           |
| `SchemaCoercionError`                                              | Thrown by `build()` when a required key is missing or fails coercion; lists every offending key at once. |
| `compareConfigurationKeys`                                         | The `:`-segment-aware comparer configuration keys sort by.                                               |
| `exists`, `ConfigurationExtensions`, `ConfigurationRootExtensions` | Small convenience helpers over a built config (existence checks, debug views).                           |

## How it fits

`@rhombus-std/config` is the engine: the builder, the merge/precedence logic,
reload tokens, the in-memory and chained-config sources, and the runtime
schema. It depends on
[`@rhombus-std/config.core`](../config.core/README.md) for the
`IConfiguration*` interfaces and on
[`@rhombus-std/primitives`](../primitives/README.md) for change tokens.

Install source packages alongside it as needed —
[`@rhombus-std/config.json`](../config.json/README.md),
[`@rhombus-std/config.env`](../config.env/README.md), and
[`@rhombus-std/config.commandline`](../config.commandline/README.md) each
add their own `add*` builder method via side-effect import.
[`@rhombus-std/config.transformer`](../config.transformer/README.md) is the
optional compile-time companion for `.withType<T>()`.

Downstream, [`@rhombus-std/options`](../options/README.md) and
[`@rhombus-std/hosting`](../hosting/README.md) build on top of a built
config to bind typed options and assemble an application host.

---

`@rhombus-std/config.transformer` is an optional add-on package.
`@rhombus-std/config` doesn't depend on it, doesn't require it, and
everything in this README except the transformer-specific sections works
without it installed.

Config should be the boring part of your app. Make it boring.
