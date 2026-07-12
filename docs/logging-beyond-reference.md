# `@rhombus-std/logging` — features beyond the reference logging stack

`@rhombus-std/logging.core` / `logging` / `logging.configuration` mirror the reference logging stack
(`ME.Logging.Abstractions` / `ME.Logging` / `ME.Logging.Configuration`) faithfully, then diverge in a
handful of directions the reference has no equivalent for. Each entry assumes you already know the
reference's `ILogger`/`ILoggerFactory`/`ILoggingBuilder`, its `LoggerFilterOptions` rule model, and
the `AddLogging`/`AddConfiguration`/`AddFilter` extension surface; it only covers what is new here.
Snippets are grounded in the real tests (`tests/logging*.test/**`) — an ambient `services` is a
`ServiceManifest` being built (the `IServiceCollection` analog), `root`/`provider` is `services.build()`
scoped, and tokens are plain strings (no transformer).

## 1. String DI tokens replace `typeof`-keyed registration

The reference keys logging services by CLR type (`Singleton(typeof(ILogger<>), typeof(Logger<>))`,
`IOptionsMonitor<LoggerFilterOptions>`). TS erases types at runtime, so every logging registration is
keyed by a namespaced string token derived from the type name — `"@rhombus-std/logging:ILoggerFactory"`,
`"@rhombus-std/logging.core:ILogger"`. A no-transformer consumer writes the literal string; a
transformer consumer derives the same string from `nameof<T>()`. The tokens are the DI identity.

```ts
// libraries/logging/src/tokens.ts
export const LOGGER_FACTORY_TOKEN = '@rhombus-std/logging:ILoggerFactory';
export const LOGGER_PROVIDER_TOKEN = '@rhombus-std/logging:ILoggerProvider';
```

## 2. The generic-category logger derives its category from a DI token, not reflection

The reference's `Logger<T>` reads `typeof(T)`'s display name to categorize the inner logger. That
reflection is impossible under type erasure, so the open `ILogger<$1> -> Logger<$1>` registration
flows the closing type's token into the constructor's `typeArg(1)` slot, and `Logger<T>` takes the
token's type-name segment as the category — the closest non-reflective analog.

```ts
// libraries/logging.core/src/logger-of-t.ts
function categoryFromToken(token: string): string {
  const separator = token.indexOf(':');
  return separator === -1 ? token : token.slice(separator + 1);
}

@augment(nameof<ILogger>())
export class Logger<T> implements ILogger<T> {
  public constructor(factory: ILoggerFactory, categoryType: Typeof<T>) {
    this.#logger = factory.createLogger(
      categoryFromToken(categoryType as unknown as string),
    );
  }
}
```

Resolving a closed `ILogger<T>` yields a logger categorized by the closing type — no category string
spelled by hand (`tests/logging.test/test/add-logging.test.ts`):

```ts
const logger = root.resolve<ILogger>(
  closeToken(ILOGGER_TOKEN, 'svc:PaymentService'),
);
logError(logger, 'boom');
expect(levels(provider, 'PaymentService')).toEqual([LogLevel.Error]);
```

`ILogger<TCategoryName = unknown>` is one phantom-param interface (`TCategoryName` appears in no
member), because TS forbids two same-named interfaces of differing arity — where the reference splits
`ILogger` and `ILogger<T>`, these collapse. `NullLogger.instance` (typed `ILogger`) is therefore
already assignable to `ILogger<T>` for any `T`; no separate `NullLogger<T>` type is needed.

**Caveat.** The explicit `LoggerFactoryExtensions.createLogger(factory, type)` form reads `type.name`,
which degrades under class-name mangling; the token-derived `Logger<T>` path is authored, so it is
unaffected. `CreateLogger<T>()` is deliberately transformer-only sugar (no-transformer-first).

## 3. Dual-export augmentations on `ILoggingBuilder` and `LoggerFilterOptions`

The reference's static extension classes (`AddLogging`, `AddFilter`, `AddConfiguration`) become
augmentation object literals, each reachable BOTH as a receiver-first standalone call and, via the
augmentation registry, as an installed method. `addFilter` ships both reference halves — one over the
`LoggerFilterOptions` value object (CLOSED, direct install), one over `ILoggingBuilder` (OPEN, registry).

```ts
// libraries/logging/src/filter-augmentations.ts — the value-object half
LoggerFilterOptionsExtensions.addFilter(options, 'MyApp', LogLevel.Warning); // standalone
options.addFilter('MyApp', LogLevel.Warning); // method form
```

The builder half routes each call through the options-configure pipeline (the reference's private
`ConfigureFilter` bridge), registering a configure step against the shared filter-options token.

## 4. `Disposable`/`Symbol.dispose` in place of `IDisposable`

`beginScope` returns a `Disposable` and every reload subscription returns a disposable registration —
the ESNext explicit-resource-management convention, used repo-wide in place of the reference's
`IDisposable`. `using` disposes deterministically; the registration is disposed by
`registration[Symbol.dispose]()` (`tests/logging.configuration.test/test/filter-options-pipeline.test.ts`).

```ts
const registration = options.subscribe!((value) => seen.push(value));
// ...
registration[Symbol.dispose]();
```

## 5. `FormattedLogValues` is a first-class public export

The reference keeps its `FormattedLogValues` internal (and its structured-state type obsolete). Here it
is a public `logging.core` export: a lazy `[holeName, value]` enumeration plus the `{OriginalFormat}`
pseudo-entry (§63), so a sink can structurally read the message template's holes without the reference's
internal machinery. The convenience wrappers and `LoggerMessage.define` both emit it as the log state.

```ts
// libraries/logging.core/src/logger-augmentations.ts
logger.log(logLevel, EventId.from(0), new FormattedLogValues(message, args),
  error, formatLogValues);
```

## 6. Collapsed convenience-wrapper overloads with explicit `EventId.from`

Each reference level method (`LogInformation`, `LogError`, …) has four overloads keyed on an optional
leading `EventId` and optional `Exception`. TS cannot dispatch on a leading value type without runtime
probing, so each collapses to two runtime-disambiguated forms — `(logger, message, ...args)` and
`(logger, error, message, ...args)` — split by whether the first post-logger arg is an `Error`. The
bare-integer-`EventId` overloads are dropped (ambiguous with a message string at runtime); a caller
needing an explicit event id writes `logger.log(level, EventId.from(n), …)`. `EventId.from` is the
explicit coercion standing in for C#'s implicit `int -> EventId` conversion.

```ts
// libraries/logging.core/src/logger-augmentations.ts
export function logInformation(logger: ILogger, message: string,
  ...args: unknown[]): void;
export function logInformation(logger: ILogger, error: Error, message: string,
  ...args: unknown[]): void;
```

## 7. A reload-reactive `LoggerFilterOptions` pipeline over one converged token

`logging.configuration`'s `addConfiguration` wires the config→filter binding as a LAZY,
reload-reactive `Options<LoggerFilterOptions>` pipeline through `options.augmentations`: a
`LoggerFilterConfigureOptions` step plus a `ConfigurationChangeTokenSource`, both keyed at the
options-assembly token. Nothing binds until the assembly materializes; a configuration reload re-runs
the parse and notifies subscribers — and the same reload path makes `LoggerFilterRule` selection
reachable at log time (`LoggerFactory` subscribes and re-selects via `LoggerRuleSelector`).

```ts
// libraries/logging.configuration/src/add-configuration.ts
const optionsToken = nameof<Options<LoggerFilterOptions>>();
builder.services.addOptions<LoggerFilterOptions>(optionsToken,
  () => new LoggerFilterOptions()).as('singleton');
builder.services.addValue(configureStepToken(optionsToken),
  new LoggerFilterConfigureOptions(configuration));
builder.services.addValue(changeTokenSourceToken(optionsToken),
  new ConfigurationChangeTokenSource(configuration));
```

A reload delivers a fresh rule set and fires every subscriber
(`tests/logging.configuration.test/test/filter-options-pipeline.test.ts`):

```ts
config.set('LogLevel:Default', 'Critical');
config.reload();
expect(seen[0]!.rules[0]!.logLevel).toBe(LogLevel.Critical);
expect(options.value.rules[0]!.logLevel).toBe(LogLevel.Critical);
```

That single `Options<LoggerFilterOptions>` token is the convergence point (#146): `addLogging`
registers the assembly and its default (Information) min level, builder-level `addFilter`/`setMinimumLevel`
append configure steps, and `addConfiguration` derives the SAME token inline from the type — so all
three compose into one filter-options value the `LoggerFactory` consumes, where the reference keys the
pipeline by the options type itself.
