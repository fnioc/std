# Design docs

- **[decisions.v2.md](decisions.v2.md)** — the live, owner-approved log of load-bearing design
  decisions & requirements. **Start here.**
- [decisions.md](decisions.md) — retiring: the pre-v2 decisions log, being struck down entry by
  entry as each is re-ratified into `decisions.v2.md`. Historical record only — never append to it.
- [augmentations.md](augmentations.md) — the augmentations mechanism (this repo's stand-in for
  extension methods): how to author one, how to consume one, how it works.
- [transformer-architecture.md](transformer-architecture.md) — how the four authoring-time
  transformers ship two engines (ts-patch + a Go/`ttsc` backend) behind one contract.

## reference

- [me-extensions-dependencies.md](reference/me-extensions-dependencies.md) — the
  ME.* package dependency graph (mermaid) we mirror; the authoritative
  layering behind our package structure.
  ([lite](reference/me-extensions-dependencies-lite.md) — same graph, provider/sink leaves dropped.)

Reference and design documents carried over from the pre-consolidation repos
(`fnioc/ioc` → the **di** family, `fnioc/config` → the **config** family).

## di

- [PRD.md](di/PRD.md) — product requirements (historical, pre-consolidation)

## config

- [no-options-port.md](config/no-options-port.md) — **superseded** (see decisions.md §4):
  the original decision _not_ to port ME.Options. We have since reversed
  it and are defining `@rhombus-std/options`.
