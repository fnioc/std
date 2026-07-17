# @rhombus-std/config.env

**Load configuration from environment variables.**

Turns `process.env` into a configuration layer for `@rhombus-std/config`,
with the usual `__`-delimited nesting, an optional prefix filter, and a
pluggable name transform — no hand-rolled parsing of environment variable
names.

## Install

```sh
bun add @rhombus-std/config @rhombus-std/config.env
```

`@rhombus-std/config` is a peer dependency — install it alongside this
package.

## Usage

```ts
import '@rhombus-std/config.env'; // unlocks .addEnvironmentVariables() on ConfigBuilder
import { ConfigBuilder } from '@rhombus-std/config';

const config = new ConfigBuilder()
  .addEnvironmentVariables({ prefix: 'APP_' })
  .build();

// APP_SERVER__PORT=8080 in the environment resolves as:
config.get('Server:Port'); // "8080"
```

Each raw variable name is transformed first (`__` → `:` by default), and
_then_ matched against `prefix`, case-insensitively — so `prefix: 'APP_'`
matches `app_`, `APP_`, or `App_` alike, and can itself be spelled either
raw (`'APP__'`) or already-delimited (`'APP_'`). The matched prefix is
stripped from the resulting key.

## Key exports

| Export                                    | What it is                                                                                                                                         |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EnvironmentVariablesConfigSource`        | The source: builds an `EnvironmentVariablesConfigProvider` from `process.env` (or a supplied map), a `prefix`, and a `variableNameTransformation`. |
| `EnvironmentVariablesConfigProvider`      | The provider that actually reads the environment map and loads it into the configuration store.                                                    |
| `EnvironmentVariablesConfigSourceOptions` | Options accepted by the source — `prefix`, `variableNameTransformation`, and `env` (for reading a map other than `process.env`, e.g. in tests).    |
| `defaultVariableNameTransformation`       | The default transform: every `__` becomes `:`.                                                                                                     |
| `colonAndDotVariableNameTransformation`   | An alternate transform for names that also want a `.` delimiter: every `___` becomes `.`, then every remaining `__` becomes `:`.                   |

## How it fits

`@rhombus-std/config.env` is one of three configuration source providers for
[`@rhombus-std/config`](../config/README.md) — install it alongside
[`@rhombus-std/config.json`](../config.json/README.md) and
[`@rhombus-std/config.commandline`](../config.commandline/README.md) as
needed. This package works by side-effect import: it patches
`.addEnvironmentVariables()` onto both `ConfigBuilder` and
`ConfigManager` via declaration merging, so a caller who calls
`.addEnvironmentVariables()` but never names another symbol from this
package still needs:

```ts
import '@rhombus-std/config.env';
```

Without that import, `.addEnvironmentVariables()` doesn't exist on the
builder — there's no fallback or partial behavior.

## Notes

- The environment map is read once, when the provider's `load()` runs (at
  `build()` time, or again on reload) — it isn't watched for live changes.
  Use a different source (a file provider, for example) if you need that.
- Passing `env` in the options lets you point the source at any
  `Record<string, string | undefined>` instead of the real `process.env` —
  useful for tests that want a hermetic set of variables without mutating the
  ambient environment.
