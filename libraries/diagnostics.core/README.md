# @rhombus-std/diagnostics.core

**The configuration model for metrics and tracing: rules, options, and builder
contracts — no collection runtime included.**

This package answers one question cleanly: _given a set of enablement rules,
is this particular instrument or activity turned on?_ It gives you the data
types to express those rules (`InstrumentRule`, `TracingRule`), the options
objects that hold them (`MetricsOptions`, `TracingOptions`), the builder
interfaces a metrics/tracing setup is configured through (`IMetricsBuilder`,
`ITracingBuilder`), and the exact selection algorithm that turns a rule list
plus a query into an enabled/disabled decision. There is no meter, instrument,
activity, or activity-source runtime behind any of this — if you need
something to actually record measurements or spans, look elsewhere. What's
here is the pure, testable configuration layer that a runtime would consult.

## Install

```sh
bun add @rhombus-std/diagnostics.core @rhombus-std/di.core @rhombus-std/options @rhombus-std/primitives
```

## Usage

The core primitive is rule resolution: given a list of rules and a query
describing an instrument, find the single most-specific matching rule and
read its `enable` flag.

```ts
import { getMostSpecificInstrumentRule, InstrumentRule,
  MeterScope } from '@rhombus-std/diagnostics.core';

const rules = [
  new InstrumentRule(undefined, undefined, undefined, MeterScope.Global, false), // disable everything
  new InstrumentRule('MyApp.Orders', undefined, undefined, MeterScope.Global,
    true), // re-enable this meter
];

const rule = getMostSpecificInstrumentRule(rules, {
  meterName: 'MyApp.Orders',
  instrumentName: 'orders-created',
  isLocalScope: false,
});

rule?.enable ?? false; // true — the meter-specific rule beats the blanket disable
```

An unspecified name field on a rule matches anything; `undefined` from
`getMostSpecificInstrumentRule` means no rule matched at all, which reads as
**disabled**. `getMostSpecificTracingRule` does the same job for
`TracingRule`/`TracingOptions`.

Rules are usually appended through the builder-targeted or options-targeted
augmentation functions rather than constructed one at a time:

```ts
import { MetricsOptions,
  MetricsOptionsExtensions } from '@rhombus-std/diagnostics.core';

const options = new MetricsOptions();
MetricsOptionsExtensions.enableMetrics(options, 'MyApp.Orders');
MetricsOptionsExtensions.disableMetrics(options, 'MyApp.Orders',
  'orders-created', 'debug-listener');
```

These same members are also installed as instance methods on `MetricsOptions`
and `TracingOptions` (`options.enableMetrics(...)`, `options.disableTracing(...)`)
and — once a concrete builder from a package like `@rhombus-std/diagnostics`
is in play — on `IMetricsBuilder`/`ITracingBuilder` too
(`builder.enableMetrics(...)`, `builder.addTracingListener(...)`). Calling the
function form directly, as above, always works and needs nothing installed;
the method form is the same call, reached through the receiver.

## Key exports

**Metrics**

| Export                                                  | What it is                                                                                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `InstrumentRule`                                        | A single enablement rule: meter name, instrument name, listener name, `MeterScope`, and an `enable` flag. Unset name fields match anything. |
| `MetricsOptions`                                        | Holds the ordered `rules: InstrumentRule[]` a metrics setup is configured from.                                                             |
| `MeterScope`, `METER_SCOPE_ALL`                         | Flags distinguishing meters created directly (`Global`) from meters created through a DI factory (`Local`).                                 |
| `getMostSpecificInstrumentRule`                         | Resolves the single winning rule for an `InstrumentRuleQuery` against a rule list; `undefined` means disabled.                              |
| `instrumentRuleMatches`, `isMoreSpecificInstrumentRule` | The matching and specificity-ordering steps `getMostSpecificInstrumentRule` is built from, exposed for direct use.                          |
| `IMetricsBuilder`                                       | The service-registration surface a metrics setup is configured through.                                                                     |
| `MetricsBuilderExtensions`                              | Builder-targeted functions: `addMetricsListener`, `addMetricsListenerType`, `clearMetricsListeners`, `enableMetrics`, `disableMetrics`.     |
| `MetricsOptionsExtensions`                              | The same `enableMetrics`/`disableMetrics` rule mutators, targeted directly at a `MetricsOptions` instance.                                  |
| `IMetricsListener`                                      | A listener's identity (`name`) as seen by rule matching — no measurement-callback surface.                                                  |

**Tracing**

| Export                                               | What it is                                                                                                                                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TracingRule`                                        | A single enablement rule: activity-source name, operation name, listener name, `ActivitySourceScopes`, and an `enable` flag. Validates its source-name wildcard eagerly. |
| `TracingOptions`                                     | Holds the ordered `rules: TracingRule[]` a tracing setup is configured from.                                                                                             |
| `ActivitySourceScopes`, `ACTIVITY_SOURCE_SCOPES_ALL` | Flags distinguishing activity sources created directly (`Global`) from those created through a DI factory (`Local`).                                                     |
| `getMostSpecificTracingRule`                         | Resolves the single winning rule for a `TracingRuleQuery` against a rule list.                                                                                           |
| `tracingRuleMatches`, `isMoreSpecificTracingRule`    | The matching and specificity-ordering steps behind the resolver.                                                                                                         |
| `ITracingBuilder`                                    | The service-registration surface a tracing setup is configured through.                                                                                                  |
| `TracingBuilderExtensions`                           | Builder-targeted functions: `addTracingListener`, `clearTracingListeners`, `enableTracing`, `disableTracing`.                                                            |
| `TracingOptionsExtensions`                           | The same `enableTracing`/`disableTracing` rule mutators, targeted directly at a `TracingOptions` instance.                                                               |
| `ActivityListenerBuilder`                            | The configurable shape of a tracing listener (`name` plus sampling/lifecycle callback slots) passed to `addTracingListener`'s configure callback.                        |

## How it fits

`@rhombus-std/diagnostics.core` depends on
[`@rhombus-std/di.core`](../di.core/README.md) for the registration surface
`IMetricsBuilder`/`ITracingBuilder` expose, on
[`@rhombus-std/options`](../options/README.md) for the configure-step shape
the deferred rule mutators register, and on
[`@rhombus-std/primitives`](../primitives/README.md) for the augmentation
registry that lets `IMetricsBuilder`/`ITracingBuilder` stay open receivers.

It has no runtime of its own: nothing here collects a measurement or emits a
span. [`@rhombus-std/diagnostics`](../diagnostics/README.md) builds on top of
it to supply the concrete `MetricsBuilder`/`TracingBuilder` implementations,
bind `MetricsOptions`/`TracingOptions` reactively from configuration, and
register everything through dependency injection via `addMetrics`/
`addTracing` — install that package alongside this one if you want a working
metrics/tracing setup rather than just the rule model.

## Notes

- There is no `Meter`, `Instrument`, `Activity`, or `ActivitySource` behind
  any of this. `IMetricsListener` is reduced to its `name` (what rule matching
  keys on), and `ActivityListenerBuilder`'s sampling/lifecycle callbacks are
  typed `unknown` because there's no activity object to hand them.
- `InstrumentRule` validates its `MeterScope` at construction but validates a
  malformed meter-name wildcard (more than one `*`) lazily, at match time.
  `TracingRule` validates both eagerly, at construction — that asymmetry is
  intentional, not a bug in either type.
- A missing rule means **disabled**: `getMostSpecificInstrumentRule(...)?.enable ?? false`
  is the correct way to read the result, never assume `true` on no match.
