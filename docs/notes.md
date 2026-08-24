# notes — deferred side-tasks

Tasks surfaced in passing and deliberately not implemented at the time. Strike items as they
land; delete the file when empty.

- [x] **`getService` → `resolve` vocabulary + one-member `IServiceProvider`** — landed: `IServiceProvider`
      keeps only `getService(serviceType: Type): any`; the callable overloads live in
      `di.core/src/augmentations/ServiceProvider-service-augmentations.ts` as `resolve`, joined by
      a plain `resolve(serviceType)` wrapper. The callable forms route through an unexported
      `Invoker<C>` marker in `di.core/src/Invoker.ts` — the engine detects its address structurally
      (`ImportedType` named `Invoker` from `@rhombus-std/di.core`, one generic arg) and synthesizes
      a closure that realizes the caller's own callable as an invocation frame. GOSPEL landed in
      `docs/features/augmentations.md`.
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
      `src/toolkit/type-helpers.ts` (the toolkit dir is the migration queue); fully general, belongs beside `Flatten`. Ride the next type-helpers publish.
- [ ] **Go-side aggregate/nominal naming echoes** — transforms/ internals (tokens/derive.go,
      typenode.go, mergesynth nominal_identity_test.go, typesurface) still speak aggregate/nominal
      where TS now says list/named; wire format unaffected. Rename on the next transforms touch.
- [ ] **di.registration.ttsc.e2e repair** — two-part: the sandbox fixture declares `Manifest<"singleton">`
      and omits the datum (now correctly refused — fixture wants `'singleton' | undefined`), and the Go
      inline host's face↔body matcher doesn't pair the rest-tuple `...lifetime: LifetimeArgument<L>` faces
      with their `(implementer, lifetime?)` bodies (INLINE_FACE_WITHOUT_BODY; sugar survives unlowered). The same face↔body diagnostics are
      FATAL in the bunfig preload, so the defect also fails whole-suite loads in
      augmentations.test, options.augmentations.test, caching.memory.test and hosting.test.
- [ ] **arg-vocabulary residual sweep** — RULED 2026-08-22: the signatures-list member is
      `signatures`; `args` is acceptable only for a single signature's own element list; per-element
      prose is "arg", never param/parameter/argument. Code, spec doors and primitives tests now
      conform; "parameter" prose still survives in builder.ts, ServiceProvider.ts docs and
      elsewhere.
- [ ] **Optional: biome via dprint-plugin-exec** for noUnusedImports autofix in the hook — offered, not
      requested; noUnusedLocals gates the same class without autofix.
- [x] __examples.app._ red against the model-taking `DefaultManifest` ctor_* — greened 2026-08-24:
      front-door rewiring, `ConstantType` stripped from example call sites, concrete demo manifests
      widened to `Manifest<unknown>` on `LifetimeModel.noop`; root `bun run build` exits 0.
- [ ] **MetricsBuilder augmentation regression — untriaged**: `tests/augmentations.test` fails with
      `this.services.addValue is not a function` at
      `diagnostics.core/src/metrics/MetricsBuilder-augmentations.ts:33`; surfaced during the
      resolve-vocab slide-in but cause unattributed (sweep vs pass fallout).
- [ ] **resolve-vocabulary residuals**: (a) OPEN owner call — `getRequiredService`/`getServices`
      keep their `get*` names beside `resolve` — rename for one vocabulary, or keep? (b) RULED
      2026-08-24, GOSPEL: `typefor` must never lie — the unexported `Invoker` marker minting a
      derivation that disagrees with the structural address is NOT acceptable; the marker must be
      exported through a seam so `typefor` derives the true address. Fix rides the invoker
      formalization (name pending owner pick).
- [ ] **RULED 2026-08-24 — scope models receive the WRAPPER**, never raw `Engine`: the engine
      keeps its current multi-entrypoint contract, `ServiceProvider` stays the routing wrap, and
      Engine-implementing-`IServiceProvider` is rejected (no current consumer; the door is
      capability-complete post-Invoker). Input for the scope-planning lane.
- [ ] **CLAUDE.md digest refresh for the di2 surface** — the Architecture digest still speaks
      pre-di2: `ConstantType`/marker phrasing (the marker no longer exists; value door = the
      `*Value` verbs + `NonCallable` add shape), `scope?` args, `Scopes` naming. One pass at lane
      end, not piecemeal.
- [ ] **augmentations.test residual 5 fails** — suites load again since the matcher fix; the
      remaining failures are untriaged (likely the hosting/logging red pile reaching through
      filter-logging-builder). Triage after the abstract-ctor Go work lands.
- [ ] **Models wiring review (standard/tagged landed unwired 2026-08-23):** surface the two
      models publicly (namespace/barrel), add di.core's missing `./tokens/*` white-box seam
      (suites deep-import by relative path meanwhile), collapse the ~80 duplicated
      Scope/Router/ScopeProvider lines shared by the two self-contained model files, and correct
      LifetimeModel.ts's doc claim that `site` is "the natural key for an instance store" (site
      is per-plan-position; the models key on (descriptor, requested type)). OWNER RULING NEEDED
      before wiring the scope-dependent red suites (caching.memory 8, hosting.core 5,
      diagnostics 3, filter-logging-builder): they spell `createScope('singleton')` on
      `Manifest<string>` — the TAGGED model's shape, not standard's. ENGINE SEAMS the full spec
      still needs (models worked around or can't): a scope-bound provider can't start a walk
      under its own model (router-cell workaround in the models); an injected IServiceProvider
      inside a scope is the container, not the scope (RealizeVisitor.ts:128-130, not fixable
      model-side); resolveLatebound re-enters under call-time scope, not captured scope
      (RealizeVisitor.ts:116-118).
- [ ] **`getRequiredService` throws a bare `Error`** when nothing is registered — outside the
      `DiError` taxonomy, so one `instanceof` no longer classifies every container failure
      (surfaced by the createScope augmentation, which had to route through `getService`'s
      undefined split instead of catching a classifiable error). Decide: `UnsatisfiableError`
      (needs the serviceType member semantics checked) or a dedicated taxonomy member.
- [ ] **The door concept — owner design direction 2026-08-24; NO implementation until he
      green-lights (model review first).** `IServiceProvider`'s one-member `getService` is not a
      bottleneck: every specialized capability is a DOOR — an address you ask the provider for,
      answered by a specialized callsite. The interface stays frozen forever; capabilities are
      addresses. Already-true instances: `ScopeFactory`, the `Invoker` marker, bare-hole type
      delivery. Pieces, in landing order when green-lit:
      - **Invoker formalization**: export the marker through a real seam (public in di.core) so
        `typefor` derives the true address — this IS the gospel fix for the typefor-lie residual.
        Resolving it returns the factory, authored with engine-guts access; the
        `resolve(callableType, callable)` augmentations remain the transparent sugar over it.
        Name open — owner floated `InvokerService`/`FrameFactory`; Claude recommends staying with
        `Invoker` (what-not-how: "frame" names the mechanism).
      - **ScopeFactory synthesis — RULED 2026-08-24: its own callsite kind** (nominal detection,
        synthesis tail so a user registration still wins; no manifest registration — model
        descriptors must be context-free values, per-container machinery lives behind the
        realizer). STANDING question: dedicated `Realizer.scopeFactory()` door (the working
        implementation) vs routing through the one `realize` door; revisit a general door table
        if doors multiply (audit service).
      - **Latebound reframed as an implicit door** — the composed-manifest semantics live behind
        the factory the door returns; the engine's multi-entrypoint contract stays private
        (consistent with the models-get-the-wrapper ruling).
      - **Resolve-audit service**: a door giving *access* (never a copied snapshot) to the details
        of the resolve that constructed its holder — full request type, serviceType, ancestry — as
        a thin handle closing over the engine's per-resolve frame; payload engine-side and lazy.
        Creation-time semantics under caching (a cache hit reuses instance + handle together).
        Requires frame data immutable-after-realize or snapshotted at synthesis. Replaces the
        Typeof witness branding. Ancestor visibility ruled fine — no intra-container trust
        boundary, and "who asked for me" is useful.
- [ ] **Mergesynth deeper enumeration — owner call open:** verbose diagnostics now enumerate a
      member's weakened positions, but inside one position's recursive composition
      (object/union/tuple guards) the first uncheckable reason still wins (`guardForType`'s
      `firstReason`, ~15 composition sites). Enumerating those too is a sizable refactor —
      wanted or not?
- [ ] **Lifetime-lane queue (order agreed with the owner; nothing runs without his go).**
      LANDED ON DISK 2026-08-23, uncommitted pending owner accept: the genesis front door
      (`di.usingLifetimeModel(...)` → ContainerBuilder; `manifest.build()` demolished),
      `addModelServices` + `name` on the LifetimeModel contract, runtime
      `ServiceProvider.createScope` throwing the dedicated `ScopeFactoryUnavailableError` when
      the model didn't publish the standard address, and the `standard`/`tagged` models
      (unwired; see the wiring-review item above). Still open, in order:
      (1) default-model WIRING — which model bare genesis/dependers run on, reviving the ~88 red
      tests (spelling ruling in the wiring-review item). (3-residual) the three engine seams the
      full spec still needs (listed in the wiring-review item). (4-residual) the TYPED
      `sp.createScope<T>()` generic face on an engine-typed provider surface. (5) disposal
      (23 red tests). (6) depender rework — hosting/logging/examples; five `@ts-nocheck -- TEMP`
      headers now (host-composition.ts joined 2026-08-23); hosting/logging genesis sites run the
      front door on `LifetimeModel.noop` as minimal green, flow-correctness unreviewed.
