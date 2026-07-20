# Design docs

- **[decisions.v2.md](decisions.v2.md)** — the live, owner-approved log of load-bearing design
  decisions & requirements. **Start here.**
- [decisions.md](decisions.md) — retiring: the pre-v2 decisions log, being struck down entry by
  entry as each is re-ratified into `decisions.v2.md`. Historical record only — never append to it.
- [divergences.md](divergences.md) — the single ledger of every owner-signed-off departure from
  the ME reference, across all families. Distinct from each family doc's own "Justified
  divergences" chapter under `libraries/`, which covers that family's broader set of intentional
  reference-beyond capabilities, not just the formally-ruled-on subset recorded here.
- [divergence-alarm.md](divergence-alarm.md) — a point-in-time audit hunting for _unrecorded_ gaps
  (not in `divergences.md`/`decisions.md`/`CLAUDE.md`) — the complement to `divergences.md`, not a
  duplicate of it.

## features

Cross-cutting mechanisms used across multiple package families.

- [augmentations.md](features/augmentations.md) — the augmentations mechanism (this repo's
  stand-in for extension methods): how to author one, how to consume one, how it works.
- [transformer-architecture.md](features/transformer-architecture.md) — how the four
  authoring-time transformers share one Go/`ttsc` engine and one owner binary underneath.

## libraries

One doc per package family, named the same as the family. Each covers the family's role, its
"Justified divergences" from the reference (deliberate departures and positive capabilities the
reference has no equivalent for — not a list of every observed gap; unrecorded gaps live in
`divergence-alarm.md` instead, and the formally owner-ruled subset is also recorded at
`../divergences.md`), and — where real rationale is worth preserving — a "Design notes" section. A
family with no divergences beyond the repo-wide augmentation pattern says so in one line rather
than going unwritten.

- [primitives.md](libraries/primitives.md)
- [di.md](libraries/di.md)
- [options.md](libraries/options.md)
- [config.md](libraries/config.md)
- [hosting.md](libraries/hosting.md)
- [diagnostics.md](libraries/diagnostics.md)
- [logging.md](libraries/logging.md)
- [caching.md](libraries/caching.md)
- [fileproviders.md](libraries/fileproviders.md)

## reference

- [me-extensions-dependencies.md](reference/me-extensions-dependencies.md) — the
  ME.* package dependency graph (mermaid) we mirror; the authoritative
  layering behind our package structure.
  ([lite](reference/me-extensions-dependencies-lite.md) — same graph, provider/sink leaves dropped.)
