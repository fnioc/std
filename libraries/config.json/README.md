# @rhombus-std/config.json

JSON file configuration provider for `@rhombus-std/config` —
`JsonConfigurationSource`/`JsonConfigurationProvider` plus the `addJsonFile`
sugar bolted onto `ConfigurationBuilder`.

## Install

```sh
npm install @rhombus-std/config @rhombus-std/config.json
```

`@rhombus-std/config` is a peer dependency — install it alongside this package.

## Basic usage

```ts
import "@rhombus-std/config.json"; // unlocks .addJsonFile() on ConfigurationBuilder
import { ConfigurationBuilder } from "@rhombus-std/config";

const config = new ConfigurationBuilder()
  .addJsonFile("appsettings.json")
  .addJsonFile("appsettings.local.json", { optional: true })
  .build();

config.get("Server:Port");
```

`optional: true` makes a missing file resolve to an empty provider instead of
throwing. Malformed JSON in a file that _does_ exist always throws, regardless
of `optional` — it only covers file absence, not file validity.

## The side-effect import requirement

`addJsonFile` isn't a method `ConfigurationBuilder` ships with — this package
bolts it on via TypeScript declaration merging plus a runtime prototype
patch. If your code calls `.addJsonFile()` but never names any other symbol
from `@rhombus-std/config.json` (no `JsonConfigurationSource`, no
`JsonConfigurationProvider`), a bundler or tree-shaker has nothing forcing it
to load this package's module — you must import it for its side effect
explicitly:

```ts
import "@rhombus-std/config.json"; // unlocks .addJsonFile() on ConfigurationBuilder
```
