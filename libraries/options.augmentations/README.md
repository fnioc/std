# @rhombus-std/options.augmentations

**The bridge between configuration and options.** It teaches a dependency
injection registration builder how to build an `Options<T>` from a
configuration section, and to keep that value fresh when the section reloads.

Install it and register a config section against a token; resolve that token
and get back a live `Options<T>` whose value tracks the underlying config —
no manual re-read, no polling.

## Install

```sh
bun add @rhombus-std/options.augmentations @rhombus-std/options @rhombus-std/config @rhombus-std/di
```

The package works by side effect: importing it installs `addOptions`,
`configure`, `postConfigure`, `validate`, and `validateOnStart` onto the
registration builder from `@rhombus-std/di.core`. Take a bare import for the
sugar:

```ts
import '@rhombus-std/options.augmentations';
```

`"sideEffects": true` is set in `package.json` so bundlers won't tree-shake
the import away.

## Usage

```ts
import { ConfigurationBuilder } from '@rhombus-std/config';
import { ServiceManifest } from '@rhombus-std/di';
import type { Options } from '@rhombus-std/options';
import '@rhombus-std/options.augmentations';

interface WidgetOptions {
  Url: string;
}

const config = new ConfigurationBuilder()
  .addInMemoryCollection({ 'Widget:Url': 'http://first' })
  .build();

const services = new ServiceManifest<'singleton'>();
services.addOptions<WidgetOptions>('app:WidgetOptions', () => ({ Url: '' })).as(
  'singleton',
);
services.configure('app:WidgetOptions', config.getSection('Widget'));

const provider = services.build().createScope('singleton');
const options = provider.resolve<Options<WidgetOptions>>('app:WidgetOptions');

options.value; // { Url: "http://first" }
options.subscribe!((value) => console.log('changed', value));

config.set('Widget:Url', 'http://second');
config.reload(); // logs "changed" { Url: "http://second" }
```

`addOptions` registers the `Options<T>` assembly for a token, starting from a
base value. `configure` binds a configuration section against that token:
each read of the resulting `Options<T>` deep-merges the section's key/value
subtree onto the base value, and because the section has a reload token, the
value is reactive — `value` re-runs on every read and `subscribe` fires on
every config reload. Register `configure` with a plain delegate instead of a
section and you get a static, non-reactive snapshot.

## Key exports

| Export                                                                                                                        | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `addOptions(token, tToken)`                                                                                                   | Registers an `Options<T>` at `token` that simply wraps the `T` already resolved from `tToken` — no pipeline.                                                                                                                                                                                                                                                                                                                                         |
| `addOptions<T>(token, makeBase)`                                                                                              | Registers the full assembly pipeline for `token`, starting each build from `makeBase()`. Returns the `.as(scope)` continuation so you choose the registration's lifetime.                                                                                                                                                                                                                                                                            |
| `configure(token, section)`                                                                                                   | Binds a configuration section to `token`: adds a config-bind step plus a change-token source, so the resulting options react to reloads.                                                                                                                                                                                                                                                                                                             |
| `configure(token, configureOptions)`                                                                                          | Registers a plain code configure step for `token` — no section, no reload reactivity.                                                                                                                                                                                                                                                                                                                                                                |
| `configure(token, depTokens, fn)`                                                                                             | A dependency-injected configure step: resolves each token in `depTokens` and passes the instances to `fn` alongside the options value.                                                                                                                                                                                                                                                                                                               |
| `postConfigure(token, step)`                                                                                                  | Registers a step that runs after every configure step for `token`.                                                                                                                                                                                                                                                                                                                                                                                   |
| `postConfigure(token, depTokens, fn)`                                                                                         | The dependency-injected form of `postConfigure`.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `validate(token, predicate, failureMessage?)`                                                                                 | Registers a validation step for `token`; a `false` result from `predicate` fails validation with the given message.                                                                                                                                                                                                                                                                                                                                  |
| `validate(token, depTokens, predicate, failureMessage?)`                                                                      | The dependency-injected form of `validate`.                                                                                                                                                                                                                                                                                                                                                                                                          |
| `validateOnStart(token)`                                                                                                      | Marks the options at `token` for eager validation at host startup, instead of lazily on first resolve — misconfiguration fails at boot.                                                                                                                                                                                                                                                                                                              |
| `ConfigurationChangeTokenSource`                                                                                              | Change-token source that wires a config section's reload token into the options pipeline.                                                                                                                                                                                                                                                                                                                                                            |
| `ConfigurationConfigureOptions`                                                                                               | The configure step that deep-merges a config section onto an options value.                                                                                                                                                                                                                                                                                                                                                                          |
| `configureStepToken`, `postConfigureStepToken`, `validateStepToken`, `changeTokenSourceToken`, `startupValidationTargetToken` | Derive the underlying registration tokens for a given options token. Exported because the per-options steps and sources are ordinary open registrations — any package can append its own configure/post-configure/validate step or change-token source for a token it doesn't own, using `services.addValue(configureStepToken(token), step)` (or `add`/`addFactory` for a lazily-constructed one), and the assembly for that token will pick it up. |

Every method above is the complete, explicit form — nothing here requires a
compile-time transformer. Typed sugar such as `addOptions<T>()` deriving its
own tokens from a type lives in a separate transformer package and lowers to
exactly these calls.

## Bind is structural

There's no reflective binder here: the config-bind step deep-merges a
section's subtree onto the options value rather than populating typed
properties by reflection. Every configuration leaf is a string, so numeric or
boolean coercion during binding is out of scope for this package — reach for
your configuration layer's own typed accessors when you need that.

## How it fits

This package is the one place dependency injection and configuration meet.
It builds on [`@rhombus-std/options`](../options/README.md) for the
`Options<T>` type and its configure/post-configure/validate pipeline, on
[`@rhombus-std/config.core`](../config.core/README.md) for the
`IConfiguration` section type, and augments the registration builder from
[`@rhombus-std/di.core`](../di.core/README.md) (a peer dependency — bring
your own DI runtime, typically [`@rhombus-std/di`](../di/README.md)).

Install `@rhombus-std/options` and a `@rhombus-std/config` builder alongside
it; without both, there's nothing to bind together.
