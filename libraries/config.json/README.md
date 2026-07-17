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
import '@rhombus-std/config.json'; // unlocks .addJsonFile() on ConfigBuilder
import { ConfigBuilder } from '@rhombus-std/config';

const config = new ConfigBuilder()
  .addJsonFile('appsettings.json')
  .addJsonFile('appsettings.local.json', { optional: true })
  .build();

config.get('Server:Port');
```

`optional: true` makes a missing file resolve to an empty provider instead of
throwing. Malformed JSON in a file that _does_ exist always throws, regardless
of `optional` — it only covers file absence, not file validity.

## Key exports

| Export                     | What it is                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `addJsonFile(path, opts?)` | Added onto `ConfigBuilder`/`ConfigManager` by the side-effect import. Registers a source that reads `path` (resolved against `process.cwd()`) as JSON. |
| `addJsonStream(payload)`   | Added the same way. Registers a source that reads an already-in-memory JSON payload instead of a file.                                                 |
| `JsonConfigSource`         | The `IConfigSource` for a file path + `JsonConfigSourceOptions`. What `addJsonFile` constructs under the hood.                                         |
| `JsonConfigProvider`       | The provider `JsonConfigSource` builds; parses and flattens the file's JSON.                                                                           |
| `JsonStreamConfigSource`   | The `IConfigSource` for an in-memory JSON payload. What `addJsonStream` constructs under the hood.                                                     |
| `JsonStreamConfigProvider` | The provider `JsonStreamConfigSource` builds.                                                                                                          |
| `JsonConfigSourceOptions`  | `{ optional?: boolean }` — the options accepted by `JsonConfigSource`'s constructor.                                                                   |

`addJsonFile`/`addJsonStream` are the primary, complete API — calling
`new JsonConfigSource(...)` and `.add(...)`-ing it yourself works
identically; the two methods just save that step.

## The side-effect import requirement

`addJsonFile` and `addJsonStream` aren't methods `ConfigBuilder` ships
with — this package bolts them on via TypeScript declaration merging plus a
runtime patch. If your code calls `.addJsonFile()` but never names any other
symbol from `@rhombus-std/config.json` (no `JsonConfigSource`, no
`JsonConfigProvider`), a bundler or tree-shaker has nothing forcing it
to load this package's module — you must import it for its side effect
explicitly:

```ts
import '@rhombus-std/config.json'; // unlocks .addJsonFile() / .addJsonStream()
```

The same two methods are unlocked on `ConfigManager` (the mutable,
always-buildable configuration root), not just `ConfigBuilder`.

## How it fits

Builds on [`@rhombus-std/config`](../config/README.md) — it registers a
source against `ConfigBuilder`/`ConfigManager` and produces a
provider that implements `@rhombus-std/config.core`'s `IConfigSource`/
`IConfigProvider` interfaces. Install it alongside `config` whenever
you need JSON as a configuration input; combine it with sibling sources like
`@rhombus-std/config.env` or `@rhombus-std/config.commandline` to layer JSON
under environment variables and command-line overrides.
