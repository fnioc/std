# `@rhombus-std/diagnostics`

`diagnostics.core` (the `IMetricsBuilder`/`ITracingBuilder` abstractions, the rule/options data
model, `METRICS_*`/`TRACING_*` tokens, and the most-specific-rule-wins resolvers) ← `diagnostics`
(concrete `MetricsBuilder`/`TracingBuilder`, config-binding pipeline, per-listener configuration
factories, the `addMetrics`/`addTracing` augmentations). The metrics/tracing **listener runtime**
(no `Meter`/`Instrument`/`Activity` analog) is intentionally not ported — see `decisions.md`/
`decisions.v2.md` for the reasoning; that's a scope decision, not an unrecorded gap.

## Justified divergences

None beyond the augmentation pattern — see `docs/features/augmentations.md`.
