# @rhombus-std/config.commandline

Command-line configuration provider for `@rhombus-std/config` —
`CommandLineConfigurationSource`/`CommandLineConfigurationProvider` plus the
`addCommandLine` sugar bolted onto `ConfigurationBuilder`.

## Install

```sh
npm install @rhombus-std/config @rhombus-std/config.commandline
```

`@rhombus-std/config` is a peer dependency — install it alongside this package.

## Basic usage

```ts
import "@rhombus-std/config.commandline"; // unlocks .addCommandLine() on ConfigurationBuilder
import { ConfigurationBuilder } from "@rhombus-std/config";

const config = new ConfigurationBuilder()
  .addCommandLine(process.argv.slice(2), { "-p": "Server:Port" })
  .build();

// `node app.js --Server:Port=8080` or `node app.js -p 8080`
config.get("Server:Port"); // "8080"
```

`switchMappings` keys are validated at construction time: every key must
start with `-`, and two keys differing only by case collide and throw. This
provider fails loudly (throws) on an unmapped short switch or a switch
missing its trailing value, rather than silently dropping it — a CLI source
should error on unparseable input, not silently drop config.

## The side-effect import requirement

`addCommandLine` isn't a method `ConfigurationBuilder` ships with — this
package bolts it on via TypeScript declaration merging plus a runtime
prototype patch. If your code calls `.addCommandLine()` but never names any
other symbol from `@rhombus-std/config.commandline`, a bundler or tree-shaker has
nothing forcing it to load this package's module — you must import it for
its side effect explicitly:

```ts
import "@rhombus-std/config.commandline"; // unlocks .addCommandLine() on ConfigurationBuilder
```
