# @rhombus-std/config.json

**A JSON file configuration source for `@rhombus-std/config`.**

It reads a JSON file (or an in-memory JSON payload) and flattens it into the
case-insensitive key/value tree that `@rhombus-std/config` builds
configuration from.

## Install

```sh
bun add @rhombus-std/config @rhombus-std/config.json
```

`@rhombus-std/config` is a peer dependency — install it alongside this package.

## Usage

```ts
import '@rhombus-std/config.json'; // unlocks .addJsonFile() on ConfigurationBuilder
import { ConfigurationBuilder } from '@rhombus-std/config';

const config = new ConfigurationBuilder()
  .addJsonFile('appsettings.json')
  .addJsonFile('appsettings.local.json', { optional: true })
  .build();

config.get('Server:Port');
```

`optional: true` makes a missing file resolve to an empty provider instead of
throwing. Malformed JSON in a file that _does_ exist always throws, regardless
of `optional` — it only covers file absence, not file validity.

## Key exports

| Export                            | What it is                                                                                                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `addJsonFile(path, opts?)`        | Added onto `ConfigurationBuilder`/`ConfigurationManager` by the side-effect import. Registers a source that reads `path` (resolved against `process.cwd()`) as JSON. |
| `addJsonStream(payload)`          | Added the same way. Registers a source that reads an already-in-memory JSON payload instead of a file.                                                               |
| `JsonConfigurationSource`         | The `IConfigurationSource` for a file path + `JsonConfigurationSourceOptions`. What `addJsonFile` constructs under the hood.                                         |
| `JsonConfigurationProvider`       | The provider `JsonConfigurationSource` builds; parses and flattens the file's JSON.                                                                                  |
| `JsonStreamConfigurationSource`   | The `IConfigurationSource` for an in-memory JSON payload. What `addJsonStream` constructs under the hood.                                                            |
| `JsonStreamConfigurationProvider` | The provider `JsonStreamConfigurationSource` builds.                                                                                                                 |
| `JsonConfigurationSourceOptions`  | `{ optional?: boolean }` — the options accepted by `JsonConfigurationSource`'s constructor.                                                                          |

`addJsonFile`/`addJsonStream` are the primary, complete API — calling
`new JsonConfigurationSource(...)` and `.add(...)`-ing it yourself works
identically; the two methods just save that step.

## The side-effect import requirement

`addJsonFile` and `addJsonStream` aren't methods `ConfigurationBuilder` ships
with — this package bolts them on via TypeScript declaration merging plus a
runtime patch. If your code calls `.addJsonFile()` but never names any other
symbol from `@rhombus-std/config.json` (no `JsonConfigurationSource`, no
`JsonConfigurationProvider`), a bundler or tree-shaker has nothing forcing it
to load this package's module — you must import it for its side effect
explicitly:

```ts
import '@rhombus-std/config.json'; // unlocks .addJsonFile() / .addJsonStream()
```

The same two methods are unlocked on `ConfigurationManager` (the mutable,
always-buildable configuration root), not just `ConfigurationBuilder`.

## How it fits

Builds on [`@rhombus-std/config`](../config/README.md) — it registers a
source against `ConfigurationBuilder`/`ConfigurationManager` and produces a
provider that implements `@rhombus-std/config.core`'s `IConfigurationSource`/
`IConfigurationProvider` interfaces. Install it alongside `config` whenever
you need JSON as a configuration input; combine it with sibling sources like
`@rhombus-std/config.env` or `@rhombus-std/config.commandline` to layer JSON
under environment variables and command-line overrides.
