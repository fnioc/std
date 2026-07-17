# @rhombus-std/config.commandline

**Command-line arguments as a configuration layer.**

Turns `process.argv` into a configuration source for `@rhombus-std/config` —
long `--Key value` / `--Key=value` switches, short switches via an explicit
mapping table, and bare `Key=Value` tokens — so CLI flags can override JSON
files and environment variables with a single `.addCommandLine()` call.

## Install

```sh
bun add @rhombus-std/config @rhombus-std/config.commandline
```

`@rhombus-std/config` is a peer dependency — install it alongside this
package.

## Usage

```ts
import '@rhombus-std/config.commandline'; // unlocks .addCommandLine() on ConfigBuilder
import { ConfigBuilder } from '@rhombus-std/config';

const config = new ConfigBuilder()
  .addCommandLine(process.argv.slice(2), { '-p': 'Server:Port' })
  .build();

// node app.js --Server:Port=8080
// node app.js -p 8080
config.get('Server:Port'); // "8080"
```

Importing the package installs `addCommandLine` onto `ConfigBuilder`
(and `ConfigManager`); calling it registers a command-line source that
`build()` parses like any other layer.

## Parsing rules

- **Long switches** — `--Key value` or `--Key=value` sets `Key`. A switch with
  no `=` and no usable following value is treated as a boolean flag (`"true"`)
  rather than swallowing the next switch.
- **Short switches** — `-x value` or `-x=value`, but only if `-x` (or `-X`,
  matched case-insensitively) is registered in the `switchMappings` table
  passed to `addCommandLine`. An unmapped short switch throws.
- **`/switch` notation** — `/Key` is treated the same as `--Key`, but only
  when it appears in switch position — never when it's consumed as another
  switch's value (`--Path /usr/bin` stays untouched).
- **Bare `Key=Value` tokens** (no leading dash) are honored too, split at the
  first `=`. A bare token with no `=` is a positional argument and is
  ignored, as is everything after a lone `--`.
- **Missing values and unmapped switches throw.** This provider fails loudly
  on unparseable input rather than silently dropping it — a CLI source should
  error, not quietly lose a flag the caller thought they'd supplied.

`switchMappings` itself is validated eagerly, at the point you call
`addCommandLine`: every key must start with `-` (covers both `-x` and
`--LongForm`), and two keys differing only by case are rejected as a
duplicate registration.

```ts
new ConfigBuilder().addCommandLine(process.argv.slice(2), {
  '-p': 'Server:Port',
  '-h': 'Server:Host',
});
```

## Key exports

| Export                                                 | What it is                                                                                                                                      |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `addCommandLine` (via `ConfigBuilder`/`ConfigManager`) | Registers a command-line source; installed by the side-effect import.                                                                           |
| `CommandLineConfigSource`                              | The `IConfigSource` — holds the raw argv tokens and validated switch mappings.                                                                  |
| `CommandLineConfigSourceOptions`                       | The options type accepted by `CommandLineConfigSource`'s constructor (`switchMappings`).                                                        |
| `CommandLineConfigProvider`                            | The provider that actually parses `argv` into config keys; constructible directly if you want a source without going through the builder sugar. |

## How it fits

`@rhombus-std/config.commandline` is one of three bundled source packages for
[`@rhombus-std/config`](../config/README.md), alongside
[`@rhombus-std/config.json`](../config.json/README.md) and
[`@rhombus-std/config.env`](../config.env/README.md). Install whichever
sources your app actually reads from — CLI flags typically go last in the
layer stack, since they're meant to override everything else at run time.

## Notes

`addCommandLine` isn't a method `ConfigBuilder` ships with on its
own — this package adds it via declaration merging plus a registration
against the shared builder. If your code calls `.addCommandLine()` but never
names any other symbol from this package, nothing forces a bundler to load
its module, so the side-effect import is required even when you don't use
anything else from it:

```ts
import '@rhombus-std/config.commandline'; // unlocks .addCommandLine() on ConfigBuilder
```
