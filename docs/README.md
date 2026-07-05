# Design docs

- **[decisions.md](decisions.md)** — running log of load-bearing design decisions &
  requirements. **Start here**, and append to it as decisions land.

## reference
- [ms-extensions-dependencies.md](reference/ms-extensions-dependencies.md) — the
  Microsoft.Extensions.* package dependency graph (mermaid) we mirror; the authoritative
  layering behind our package structure.
  ([lite](reference/ms-extensions-dependencies-lite.md) — same graph, provider/sink leaves dropped.)

Reference and design documents carried over from the pre-consolidation repos
(`fnioc/ioc` → the **di** family, `fnioc/config` → the **config** family).

## di
- [PRD.md](di/PRD.md) — product requirements (historical, pre-consolidation)
- [PLAN.md](di/PLAN.md) — implementation plan (historical, pre-consolidation)

## config
- [no-options-port.md](config/no-options-port.md) — **superseded** (see decisions.md §4):
  the original decision *not* to port Microsoft.Extensions.Options. We have since reversed
  it and are defining `@rhombus-std/options`.
- [TODO.md](config/TODO.md) — parked config follow-ups
