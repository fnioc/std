# @rhombus-std/options.augmentations

**The bridge between configuration and options.** It teaches a dependency
injection registration builder how to build an `IOptions<T>` from a
configuration section, and to keep that value fresh when the section reloads.

Install it and register a config section against an options type; resolve
that type's `IOptions<T>` address and get back a live value whose value
tracks the underlying config — no manual re-read, no polling.

## Install

```sh
bun add @rhombus-std/options.augmentations @rhombus-std/options @rhombus-std/config @rhombus-std/di
```

Importing the package installs `addOptions` onto `Manifest` from
`@rhombus-std/di.core` by side effect. Take a bare import for it:

```ts
import '@rhombus-std/options.augmentations';
```

`"sideEffects": true` is set in `package.json` so bundlers won't tree-shake
the import away. `configure`, `postConfigure`, `validate`, and
`validateOnStart` are ordinary functions instead — each builds and returns
its own manifest, which a caller merges into their registrations with
`addMany`; a named import brings them into scope like anything else.

## Usage

```ts
import { ConfigBuilder } from '@rhombus-std/config';
import { Builder } from '@rhombus-std/di';
import { type Addon, Manifest, Type } from '@rhombus-std/di.core';
import type { IOptions } from '@rhombus-std/options';
import { getConfigureManifest, optionsAddressType } from '@rhombus-std/options.augmentations';

interface WidgetOptions {
  Url: string;
}
const WIDGET_OPTIONS_TYPE = Type.imported('WidgetOptions', 'app');

const config = new ConfigBuilder().addInMemoryCollection({ 'Widget:Url': 'http://first' }).build();

let services = Manifest.empty<unknown>();
services = services.addOptions(WIDGET_OPTIONS_TYPE, () => ({ Url: '' }));
services = services.addMany(getConfigureManifest(WIDGET_OPTIONS_TYPE, config.getSection('Widget')));

// No lifetime model is installed; a vacuous addon opens the builder's vocabulary with nothing.
const noLifetimeModel: Addon<unknown> = { registrations: [], middleware: (next) => next };
const provider = Builder.useAddon(noLifetimeModel).withServices(() => services).build();
const options: IOptions<WidgetOptions> = provider.resolve(optionsAddressType(WIDGET_OPTIONS_TYPE));

options.value; // { Url: "http://first" }
options.subscribe!((value) => console.log('changed', value));

config.set('Widget:Url', 'http://second');
config.reload(); // logs "changed" { Url: "http://second" }
```

`addOptions` registers the `IOptions<T>` assembly for an options type,
starting from a base value; `IOptions<T>` itself resolves at
`optionsAddressType(optionsType)`, a composed address distinct from the bare
options type every pipeline verb takes. `getConfigureManifest` returns a
manifest binding a configuration section against that type: each read of the
resulting `IOptions<T>` deep-merges the section's key/value subtree onto the
base value, and because the section has a reload token, the value is
reactive — `value` re-runs on every read and `subscribe` fires on every
config reload. Call `getConfigureManifest` with a plain delegate instead of a
section and you get a static, non-reactive snapshot.

## Key exports

| Export                                                                                                                             | What it does                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `addOptions(optionsType)`                                                                                                          | Offers `IOptions<any>` for `optionsType`, wrapping whatever `optionsType` itself resolves to — no pipeline.                                                                                                                                                                                                                                                                                                                            |
| `addOptions(optionsType, makeBase)`                                                                                                | Offers `IOptions<any>` for `optionsType`, building its value through the full pipeline: `makeBase()` produces the instance each run starts from.                                                                                                                                                                                                                                                                                       |
| `getConfigureManifest(optionsType, section)`                                                                                       | A manifest binding a configuration section to `optionsType`: a config-bind step plus a change-token source, so the resulting options react to reloads. Merge it in with `addMany`.                                                                                                                                                                                                                                                     |
| `getConfigureManifest(optionsType, configureOptions)`                                                                              | A manifest with a plain code configure step for `optionsType` — no section, no reload reactivity.                                                                                                                                                                                                                                                                                                                                      |
| `getConfigureManifest(optionsType, depTypes, fn)`                                                                                  | The dependency-injected form: a manifest whose configure step resolves each type in `depTypes` and passes the instances to `fn` alongside the options value.                                                                                                                                                                                                                                                                           |
| `getPostConfigureManifest(optionsType, step)`                                                                                      | A manifest with a step that runs after every configure step for `optionsType`.                                                                                                                                                                                                                                                                                                                                                         |
| `getPostConfigureManifest(optionsType, depTypes, fn)`                                                                              | The dependency-injected form of `getPostConfigureManifest`.                                                                                                                                                                                                                                                                                                                                                                            |
| `getValidateManifest(optionsType, predicate, failureMessage?)`                                                                     | A manifest with a validation step for `optionsType`; a `false` result from `predicate` fails validation with the given message.                                                                                                                                                                                                                                                                                                        |
| `getValidateManifest(optionsType, depTypes, predicate, failureMessage?)`                                                           | The dependency-injected form of `getValidateManifest`.                                                                                                                                                                                                                                                                                                                                                                                 |
| `getValidateOnStartManifest(optionsType)`                                                                                          | A manifest marking the options at `optionsType` for eager validation at host startup, instead of lazily on first resolve — misconfiguration fails at boot.                                                                                                                                                                                                                                                                             |
| `ConfigChangeTokenSource`                                                                                                          | Change-token source that wires a config section's reload token into the options pipeline.                                                                                                                                                                                                                                                                                                                                              |
| `ConfigConfigureOptions`                                                                                                           | The configure step that deep-merges a config section onto an options value.                                                                                                                                                                                                                                                                                                                                                            |
| `configureStepType`, `postConfigureStepType`, `validateStepType`, `changeTokenSourceType`, `baseFactoryType`, `optionsAddressType` | Derive the underlying registration address for a given options type. Exported because the per-options steps and sources are ordinary open registrations — any package can append its own configure/post-configure/validate step or change-token source for a type it doesn't own, using `manifest.addValue(configureStepType(optionsType), step)` (or `add` for a lazily-constructed one), and the assembly for that type picks it up. |

`addOptions` is the one verb installed onto `Manifest` — the rest are plain
functions, and every one above is the complete, explicit form; nothing here
requires a compile-time transformer. Typed sugar such as `addOptions<T>()`
deriving its own address from a type lives in
[`@rhombus-std/di.extras.options`](../di.extras.options/README.md) and lowers
to exactly the `addOptions` call above.

## Bind is structural

There's no reflective binder here: the config-bind step deep-merges a
section's subtree onto the options value rather than populating typed
properties by reflection. Every configuration leaf is a string, so numeric or
boolean coercion during binding is out of scope for this package — reach for
your configuration layer's own typed accessors when you need that.

## How it fits

This package is the one place dependency injection and configuration meet.
It builds on [`@rhombus-std/options`](../options/README.md) for the
`IOptions<T>` type and its configure/post-configure/validate pipeline, on
[`@rhombus-std/config.core`](../config.core/README.md) for the
`IConfig` section type, and augments the registration builder from
[`@rhombus-std/di.core`](../di.core/README.md) (a peer dependency — bring
your own DI runtime, typically [`@rhombus-std/di`](../di/README.md)).

Install `@rhombus-std/options` and a `@rhombus-std/config` builder alongside
it; without both, there's nothing to bind together.
