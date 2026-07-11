# @rhombus-std/config.env

Environment-variable configuration provider for `@rhombus-std/config` —
`EnvironmentVariablesConfigurationSource`/`EnvironmentVariablesConfigurationProvider`
plus the `addEnvironmentVariables` sugar bolted onto `ConfigurationBuilder`.

## Install

```sh
npm install @rhombus-std/config @rhombus-std/config.env
```

`@rhombus-std/config` is a peer dependency — install it alongside this package.

## Basic usage

```ts
import '@rhombus-std/config.env'; // unlocks .addEnvironmentVariables() on ConfigurationBuilder
import { ConfigurationBuilder } from '@rhombus-std/config';

const config = new ConfigurationBuilder()
  .addEnvironmentVariables({ prefix: 'APP_' })
  .build();

// APP_SERVER__PORT=8080 in the environment resolves as:
config.get('Server:Port'); // "8080"
```

Variable names are normalized (`__` → `:`) before prefix matching, and the
prefix match itself is case-insensitive — `app_`, `APP_`, and `App_` all match
a `prefix: "APP_"` source.

## The side-effect import requirement

`addEnvironmentVariables` isn't a method `ConfigurationBuilder` ships with —
this package bolts it on via TypeScript declaration merging plus a runtime
prototype patch. If your code calls `.addEnvironmentVariables()` but never
names any other symbol from `@rhombus-std/config.env`, a bundler or tree-shaker has
nothing forcing it to load this package's module — you must import it for
its side effect explicitly:

```ts
import '@rhombus-std/config.env'; // unlocks .addEnvironmentVariables() on ConfigurationBuilder
```
