# @rhombus-std/logging.config

**Drive your log-level filters from configuration instead of hard-coded calls.**

Point `addConfiguration` at an `IConfig` tree and your logging setup's
minimum levels — global and per-provider — come from a config file or
environment variable, and update live on reload. It also gives individual
logging providers (a console sink, a custom transport) a clean way to read
their own configuration section without depending on the configuration
library directly.

## Install

```sh
bun add @rhombus-std/logging.config @rhombus-std/logging @rhombus-std/config
```

Importing the package registers `addConfiguration` onto `ILoggingBuilder` as
a side effect — keep the import even if you never reference a named export:

```ts
import '@rhombus-std/logging.config';
```

## Usage

```ts
import { ConfigBuilder } from '@rhombus-std/config';
import { ServiceManifestClass } from '@rhombus-std/di.core';
import { LoggingBuilder } from '@rhombus-std/logging';
import '@rhombus-std/logging.config';

const configuration = new ConfigBuilder()
  .addJsonFile('logging.json')
  .build();

const services = new ServiceManifestClass();
const builder = new LoggingBuilder(services);
builder.addConfiguration(configuration);
```

`logging.json`:

```json
{
  "LogLevel": { "Default": "Information", "MyApp": "Debug" },
  "Console": { "LogLevel": { "Default": "Warning" } }
}
```

A top-level `LogLevel` section sets the default rules for every provider. A
section named after a provider (`"Console"` above) scopes its own nested
`LogLevel` to just that provider. Reload the underlying configuration and the
filter rules recompute automatically — nothing needs to be re-registered.

`addConfiguration` also works with no arguments (`builder.addConfiguration()`)
to register only the provider-configuration plumbing described below, without
binding `LoggerFilterOptions` from anything.

## Key exports

| Export                                   | What it is                                                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `LoggingBuilderExtensions`               | The standalone form of `addConfiguration` — call it directly as `LoggingBuilderExtensions.addConfiguration(builder, configuration)`.        |
| `addConfiguration` (method)              | Same operation, as an instance method on `ILoggingBuilder` once this package is imported.                                                   |
| `ILoggerProviderConfig<T>`               | Interface exposing the configuration section bound to a specific logger provider.                                                           |
| `loggerProviderConfigToken`              | Derives the registration token for `ILoggerProviderConfig<T>` closed over a given provider type.                                            |
| `ILoggerProviderConfigFactory`           | Interface a provider resolves to fetch its own configuration section by provider token.                                                     |
| `LoggerProviderConfig`                   | The concrete `ILoggerProviderConfig<T>` implementation, backed by the factory.                                                              |
| `LoggerProviderConfigFactory`            | The concrete `ILoggerProviderConfigFactory` implementation.                                                                                 |
| `LoggerProviderOptions`                  | `registerProviderOptions(services, optionsToken, providerType)` — wires a provider's options type to reload from its configuration section. |
| `LoggerProviderConfigureOptions`         | The configure step `registerProviderOptions` registers for a provider's options.                                                            |
| `LoggerProviderOptionsChangeTokenSource` | The reload change-token source `registerProviderOptions` registers for a provider's options.                                                |
| `LoggerFilterConfigureOptions`           | The configure step that binds `LoggerFilterOptions` (levels, rules, scope capture) from configuration.                                      |
| `LoggingConfig`                          | A small holder exposing the raw `IConfig` the logging setup was bound from.                                                                 |

## Writing a configurable provider

If you're authoring your own logging provider and want its options bound
from a section of the same configuration tree — the same mechanism the
built-in filter binding uses — call `LoggerProviderOptions.registerProviderOptions`
after `addConfiguration` has run:

```ts
import { LoggerProviderOptions } from '@rhombus-std/logging.config';

LoggerProviderOptions.registerProviderOptions<MyProviderOptions, MyProvider>(
  services,
  myProviderOptionsToken,
  myProviderToken,
);
```

That appends a configure step and a reload-reactive change-token source to
`myProviderOptionsToken`'s options pipeline, sourced from whatever
`ILoggerProviderConfigFactory` resolves as `MyProvider`'s section —
so `IOptions<MyProviderOptions>` stays current across configuration reloads
with no extra wiring in the provider itself.

## How it fits

`@rhombus-std/logging.config` sits between
[`@rhombus-std/logging`](../logging/README.md) and
[`@rhombus-std/config`](../config/README.md): it reads an `IConfig`
built by `config` and uses it to drive the filter rules and generic-category
loggers that `logging` resolves. It also leans on
[`@rhombus-std/options`](../options/README.md) and
[`@rhombus-std/options.augmentations`](../options.augmentations/README.md)
for the reload-reactive configure/change-token pipeline, and on
[`@rhombus-std/di.core`](../di.core/README.md) for registration.

Install `@rhombus-std/logging` and `@rhombus-std/config` alongside it — this
package binds the two together but doesn't replace either. Concrete logging
sinks such as [`@rhombus-std/logging.console`](../logging.console/README.md)
and [`@rhombus-std/logging.browserconsole`](../logging.browserconsole/README.md)
are independent of this package; use it only when you want filter levels or
provider options sourced from configuration rather than set in code.

## Notes

- `addConfiguration` is lazy: nothing is read from the configuration until
  the underlying `IOptions<LoggerFilterOptions>` (or provider options) value is
  actually resolved, and a configuration reload re-runs the binding.
- The side-effect import is required exactly once, anywhere in your app's
  startup path — `addConfiguration` doesn't exist on `ILoggingBuilder` until
  this package has been imported.
