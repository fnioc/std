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
- [ ] **Hoist `DistributiveOmit` + `ButNot` into `@rhombus-toolkit/type-helpers`** — currently in primitives
      `src/utils/type-helpers.ts` (the utils dir is the migration queue); fully general, belongs beside `Flatten`. Ride the next type-helpers publish.
- [ ] **Go-side aggregate/nominal naming echoes** — transforms/ internals (tokens/derive.go,
      typenode.go, mergesynth nominal_identity_test.go, typesurface) still speak aggregate/nominal
      where TS now says list/named; wire format unaffected. Rename on the next transforms touch.
- [ ] **di.registration.ttsc.e2e repair** — two-part: the sandbox fixture declares `Manifest<"singleton">`
      and omits the datum (now correctly refused — fixture wants `'singleton' | undefined`), and the Go
      inline host's face↔body matcher doesn't pair the rest-tuple `...lifetime: LifetimeArgument<L>` faces
      with their `(implementer, lifetime?)` bodies (INLINE_FACE_WITHOUT_BODY; sugar survives unlowered). The same face↔body diagnostics are
      FATAL in the bunfig preload, so the defect also fails whole-suite loads in
      augmentations.test, options.augmentations.test, caching.memory.test and hosting.test.
- [ ] **arg-vocabulary residual sweep** — Engine/CallSite files done; "parameter" prose survives in
      builder.ts, ServiceProvider.ts docs and elsewhere; house rule is arg, never param/argument.
      ALSO 9 primitives tests red at tip (predates 2026-08-22 work; bisected): type-from/
      type-match call the spec doors with `args:` while Type.ts reads `spec.signatures`
      (throws in atLeastOneSignature) — the sweep's code-side half never landed in Type.ts.
- [ ] **Optional: biome via dprint-plugin-exec** for noUnusedImports autofix in the hook — offered, not
      requested; noUnusedLocals gates the same class without autofix.
- [ ] __examples.app._ red against the model-taking `DefaultManifest` ctor_* — the demos call
      `new DefaultManifest<'singleton'>()` bare (TS2554) plus kind-mismatch fallout
      (`typeof PaymentRouter` as `Func`); depender-rework territory alongside hosting/logging.
- [ ] **CLAUDE.md digest refresh for the di2 surface** — the Architecture digest still speaks
      pre-di2: `ConstantType`/marker phrasing (the marker no longer exists; value door = the
      `*Value` verbs + `NonCallable` add shape), `scope?` args, `Scopes` naming. One pass at lane
      end, not piecemeal.
