# @rhombus-std/config

Layered, provider-based configuration for TypeScript: build a configuration
tree out of multiple sources, resolve keys with last-source-wins precedence
and case-insensitive matching, and bind the result to a typed schema at
compile time.

This package is the engine — `ConfigurationBuilder`/`ConfigurationRoot`/
`ConfigurationSection`, the abstract `ConfigurationProvider` base, the
`IConfiguration*` abstractions (re-exported from `@rhombus-std/config.core`),
`ConfigurationKeyComparer`, the bundled Memory provider, and `bindConfig`. It
has no file/env/CLI sources of its own beyond Memory — install
`@rhombus-std/config.json`, `@rhombus-std/config.env`, and/or `@rhombus-std/config.commandline` alongside
it for those.

## Install

```sh
npm install @rhombus-std/config
```

## Basic usage

```ts
import { ConfigurationBuilder } from "@rhombus-std/config";

const config = new ConfigurationBuilder()
  .addInMemoryCollection({ "Server:Port": "8080" })
  .build();

config.get("Server:Port"); // "8080"
config.getSection("Server").get("Port"); // "8080"
```

More idiomatically, install a provider package and use its `add*` sugar
instead of constructing sources by hand:

```ts
import "@rhombus-std/config.json";
import "@rhombus-std/config.env";
import { bindConfig, ConfigurationBuilder } from "@rhombus-std/config";

interface AppConfig {
  Server: { Port: number; Host: string };
}

const config = new ConfigurationBuilder()
  .addJsonFile("appsettings.json")
  .addEnvironmentVariables({ prefix: "APP_" })
  .build();

const app = bindConfig<AppConfig>(config);
```

Sources are checked **last-registered first**: `addEnvironmentVariables()`
here overrides anything `addJsonFile()` loaded for the same key.

## Providers need a side-effect import

Every `add*` method (`addJsonFile`, `addEnvironmentVariables`,
`addCommandLine`) is bolted onto `ConfigurationBuilder` by its own provider
package via TypeScript declaration merging plus a runtime prototype patch.
If your code only calls `.addJsonFile()` and never names another symbol from
`@rhombus-std/config.json`, you still need to import the package for its side effect:

```ts
import "@rhombus-std/config.json"; // unlocks .addJsonFile() on ConfigurationBuilder
```

A bundler or tree-shaker has nothing else forcing that module to load, since
no value is actually referenced — the import exists purely to run the
augmentation.
