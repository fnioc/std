# @rhombus-std/options.augmentations

The config → `Options<T>` bridge ported from `ME.Options.ConfigurationExtensions`
(see [`docs/decisions.md` §4.1](../../docs/decisions.md) and §13). It installs
two fluent authoring methods onto `@rhombus-std/di.core`'s registration builder
via the extension-method-mimicking augmentation pattern (TS declaration merging
plus a runtime `prototype` assignment), exactly how `@rhombus-std/config.json`
adds `addJsonFile` to `ConfigurationBuilder`. The bridge code lives only here —
`di` and `config` stay mutually unaware.

Because the augmentation is installed as a side effect, a consumer who only
wants the sugar takes a bare side-effect import:

```ts
import "@rhombus-std/options.augmentations";
```

This package keeps `"sideEffects": true` so a bundler cannot tree-shake the
augmentation away.

## `addOptions<T>(token, makeBase)`

Registers the `Options<T>` assembly at `token`. Resolving `token` runs the
`OptionsFactory` pipeline (`@rhombus-std/options`, §4.5) over the base
`makeBase()` produces, pulling every configure / post-configure / validate step
and change-token source registered for `token` out of the container as
collections (`Array<T>` resolution, §12). It returns the `.as(scope)`
continuation, so the registration lifetime is chosen at the call site — with
open-ended scopes there is no fixed `IOptions` / `IOptionsSnapshot` lifetime to
default to (§4.2).

## `configure(token, section)`

Registers a configuration `section` to bind against the options identified by
`token`. Mirrors ME's `Configure<TOptions>(IConfiguration)`: it adds

- a **config-bind configure step** — a pipeline participant that deep-merges the
  section's key/value subtree into the value (ME's
  `NamedConfigureFromConfigurationOptions`), and
- a **change-token source** wired to `section.getReloadToken()` (ME's
  `ConfigurationChangeTokenSource`), so the delivered `Options<T>` is reactive.

When any change-token source is present the assembly hands back a reactive
`Options<T>` (`Options.watch`): `value` re-runs the pipeline on every read, and
`subscribe` fires with the fresh value on every configuration reload (#6). With
no source it is a static `Options.of` snapshot.

```ts
import { ConfigurationBuilder } from "@rhombus-std/config";
import { ServiceManifest } from "@rhombus-std/di";
import type { Options } from "@rhombus-std/options";
import "@rhombus-std/options.augmentations";

interface WidgetOptions {
  Url: string;
}

const config = new ConfigurationBuilder()
  .addInMemoryCollection({ "Widget:Url": "http://first" })
  .build();

const services = new ServiceManifest<"singleton">();
services.addOptions<WidgetOptions>("app:WidgetOptions", () => ({ Url: "" })).as(
  "singleton",
);
services.configure("app:WidgetOptions", config.getSection("Widget"));

const provider = services.build().createScope("singleton");
const options = provider.resolve<Options<WidgetOptions>>("app:WidgetOptions");

options.value; // { Url: "http://first" }
options.subscribe!((value) => console.log("changed", value));

config.set("Widget:Url", "http://second");
config.reload(); // logs "changed" { Url: "http://second" }
```

## Bind is structural

TS has no reflective binder, so the config-bind step deep-merges the section's
subtree onto the value rather than reflectively populating typed properties. All
config leaves are strings, so richer coercion is a schema / data-annotations
concern deferred to a later satellite (§4.4).
