# notes — deferred side-tasks

Tasks surfaced in passing and deliberately not implemented at the time. Strike items as they
land; delete the file when empty.

- [ ] **Rework the broken dependers** and delete the four `// @ts-nocheck -- TEMP` headers
      (`hosting/src/HostApplicationBuilder.ts`, `hosting/src/HostBuilder.ts`,
      `hosting/src/default-config.ts`, `logging/src/LoggerFactory.ts`). Until then those two
      packages' `tsc` gates pass spuriously. The broken test suites (`tests/di.test` scope
      suites, `tests/hosting.core.test`, …) ride the same rework.
- [ ] **Align the requirements doc with the LifetimeModel naming** — `docs/di2.scope-async.requirements.md`
      still says `ScopeModel*`/"scope model" throughout; the ruled public naming is now
      `LifetimeModel*`, `Manifest<Lifetime>`, descriptor `lifetime`. Includes deciding the
      attribution-wrap error's name (`ScopeModelError` → `LifetimeModelError`).
- [ ] **`LifetimeArgument` name/home** — new exported di.core alias (`LifetimeModel.ts`); owner
      veto on the name or placement still open.
- [ ] **Descriptor `lifetime` property is unconditionally optional** — the admissibility gate
      covers the verb dialect and the builder dialect, but a hand-written descriptor literal
      omitting `lifetime` still satisfies `ServiceDescriptor<Lifetime>` under a vocabulary that
      excludes `undefined`. Decide whether the property becomes conditionally required
      (`undefined extends Lifetime`) like the argument spelling.
- [ ] **Variance annotations on `Manifest`/`LifetimeModel`** — both are genuinely invariant;
      annotating (house style) breaks the widest-`Manifest<unknown>` receivers, which then need
      per-function generics. Do together or not at all.
- [ ] **Rebuild stale dist bundles beyond the di family** — the rename sweeps (`Scopes` →
      `Lifetime`, `scope` → `lifetime`) touched many packages; only primitives/primitives.extras/
      di.core/di dists were rebuilt. Stale sibling dists resurface phantom two-generic `Manifest`
      diagnostics in the editor.
- [ ] **Mergesynth guard-warning noise** — a cold lowering cache replays ~256 benign
      "merge guard for X cannot check …" lines per full rebuild. Consider a quieter default or a
      summary line.
