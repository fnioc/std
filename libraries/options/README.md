# @rhombus-std/options

**One accessor for a bound configuration value, plus the pipeline that builds it.**

Most apps end up with three ways to read the same settings object: a
singleton snapshot, a per-request snapshot, and a reactive "give me the
latest" monitor. `@rhombus-std/options` collapses that down to one type,
`IOptions<T>`, with an optional `subscribe` for values that can change at
runtime. It also ships the `OptionsFactory` pipeline that assembles, checks,
and validates the value in the first place — independent of where that value
came from. This package knows nothing about configuration files, environment
variables, or dependency injection; it's the plumbing those systems build on.

## Install

```sh
bun add @rhombus-std/options
```

## Usage

A static value never changes, so it has no `subscribe`:

```ts
import { Options } from '@rhombus-std/options';

const options = Options.of({ port: 8080 });
options.value; // { port: 8080 }
options.subscribe; // undefined
```

A reactive value re-reads on every access, and `subscribe` wires a listener
through a change token:

```ts
import { CancellationChangeToken } from '@rhombus-std/primitives';

const controller = new AbortController();
const monitor = Options.watch(
  () => currentConfig(),
  () => new CancellationChangeToken(controller.signal),
);

const registration = monitor.subscribe!((value) =>
  console.log('changed', value)
);
controller.abort(); // fires the listener with the latest value
registration[Symbol.dispose]();
```

The function passed to `Options.watch` must hand back a token representing
the _next_ change window each time it's called — a stale, already-fired
token makes `subscribe` fire synchronously forever.

## Building a value: the `OptionsFactory` pipeline

`OptionsFactory<T>` assembles a bound options value in four stages:

```
make base -> configure steps -> post-configure steps -> validate -> return
```

```ts
import { OptionsFactory, ValidateOptionsResult } from '@rhombus-std/options';

const factory = new OptionsFactory<{ port: number; }>(
  () => ({ port: 0 }), // makeBase
  [{ configure: (o) => (o.port = 8080) }], // configure steps, in order
  [{ postConfigure: (o) => (o.port = o.port || 80) }], // guaranteed last word
  [
    {
      validate: (o) =>
        o.port > 0
          ? ValidateOptionsResult.success
          : ValidateOptionsResult.fail('port must be positive'),
    },
  ],
);

factory.create(); // { port: 8080 }
```

Configure steps compose the value from its sources and run in registration
order; post-configure steps get a guaranteed-last look before validation;
validate steps run last and every failure across every step is aggregated
into one thrown `OptionsValidationError`. There's no per-name parameter on
any step — each `OptionsFactory` serves exactly one value, so distinct named
configurations are just distinct factories.

## Validating on startup

`IStartupValidator` forces eager validation of every value marked for
startup checking, so a misconfiguration fails at boot instead of on first
use:

```ts
import { StartupValidator } from '@rhombus-std/options';

const validator = new StartupValidator(resolver, targetTokens);
validator.validate(); // throws OptionsValidationError, or AggregateError for several
```

You won't normally construct `StartupValidator` yourself — a host resolves
it and calls `validate()` before starting, once something has registered a
value for startup validation (see `options.augmentations`, below).

## Accumulating validation failures

`ValidateOptionsResultBuilder` lets a validate step check several things and
report them all at once, instead of stopping at the first problem:

```ts
import { ValidateOptionsResultBuilder } from '@rhombus-std/options';

function validate(o: { port: number; host: string; }) {
  const builder = new ValidateOptionsResultBuilder();
  if (o.port <= 0) {
    builder.addError('must be positive', 'port');
  }
  if (!o.host) {
    builder.addError('is required', 'host');
  }
  return builder.build(); // success, or a failure carrying every message
}
```

## Key exports

| Export                                  | What it is                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| `IOptions<T>`                           | The accessor interface: a `value` getter plus an optional `subscribe`.         |
| `Options.of(value)`                     | A static snapshot — `value` never changes, no `subscribe`.                     |
| `Options.watch(getValue, produceToken)` | A reactive value backed by a change-token producer.                            |
| `OptionsFactory<T>`                     | Runs the configure / post-configure / validate pipeline and returns the value. |
| `IConfigureOptions<T>`                  | A configure step: `configure(options)`.                                        |
| `IPostConfigureOptions<T>`              | A post-configure step: `postConfigure(options)`.                               |
| `IValidateOptions<T>`                   | A validate step: `validate(options): ValidateOptionsResult`.                   |
| `ValidateOptionsResult`                 | Outcome of a validate step — succeeded, skipped, or failed with messages.      |
| `ValidateOptionsResultBuilder`          | Accumulates several failures into one `ValidateOptionsResult`.                 |
| `OptionsValidationError`                | Thrown by `OptionsFactory.create()` when a validate step fails.                |
| `IStartupValidator`                     | Forces eager validation of every value marked for startup checking.            |
| `StartupValidator`                      | The built-in `IStartupValidator`, driven by a resolver and a set of tokens.    |

## How it fits

`@rhombus-std/options` depends only on
[`@rhombus-std/primitives`](../primitives/README.md) (for change tokens) and
[`@rhombus-std/di.core`](../di/README.md) (for the resolver/token types
`StartupValidator` is built from) — it has no runtime dependency on
configuration or on the dependency-injection engine itself.

It doesn't know how to bind a value from a configuration tree, and it
doesn't register anything into a dependency-injection container on its own.
That's [`@rhombus-std/options.augmentations`](../options.augmentations/README.md):
it's the package that adds `addOptions`/`configure`/`postConfigure`/
`validate`/`validateOnStart` onto a service registration builder, and — for
consumers who also install configuration — binds a configuration section
into an `IOptions<T>` that stays reactive through the section's reload token.
Install `options.augmentations` alongside this package if you want either of
those capabilities; install `@rhombus-std/options` alone if you just need
the `IOptions<T>` accessor shape or the `OptionsFactory` pipeline in
isolation (for example, in a library that builds its own settings object
without a full container).

## Notes

- There's no per-name accessor (a `.get(name)` on a shared monitor). A
  differently-named configuration is a distinct `IOptions<T>` registration,
  not a parameter on a shared one.
- There's no options cache type here — how long a built value lives is a
  registration-lifetime concern for whatever wires this package up, not
  something `@rhombus-std/options` decides for you.
- The pipeline is synchronous end to end: `configure`, `postConfigure`, and
  `validate` all run synchronously, so there's no async validate step to
  await.
