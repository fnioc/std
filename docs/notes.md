# notes — deferred side-tasks

Tasks surfaced in passing and deliberately not implemented at the time. Strike items as they
land; delete the file when empty.

- [ ] **HELD, awaiting owner go — inherited task 1 (owner-ruled 2026-08-24): types-only
      `./builders` subpath on di.core** resolving the one-arg asClass/asFactory di.extras sugar
      halt. Full spec: export `IAsImplementer`/`ServiceDescriptorBuilder`/`Slot` in-file in
      di.core `src/builder.ts` (root surface unchanged); dev `exports` subpath → `./src/builder.ts`;
      published shape TYPES-ONLY (`types` condition, deliberately no `default`) taught to
      `derive-publish-config.ts` (must NOT ride the `./tokens/*` scrub — an unresolvable specifier
      detaches the sugar as an ambient module); rolled root `.d.ts` treats
      `@rhombus-std/di.core/builders` as external-self and the subpath emits its own dts; di.extras
      one-arg sugars via `declare module '@rhombus-std/di.core/builders'` on `IAsImplementer`
      (return `ServiceDescriptorBuilder<T, Scopes, Exclude<Slots, 'implementer'>>`), marker inline
      bodies `asClass(x)` → `asClass(x, typefor(x))` / `asFactory` likewise, published through the
      `registerInlineBodies` channel, files under `augmentations/`; ttsc e2e parity (lowered
      emission byte-equals the hand-written two-arg call); check off the rewrite-plan halt with a
      one-line resolution; decisions.v2 § entry, present-tense. Full gates before push.
- [x] **COMMITTED `c03643c1` (owner-approved) — inherited task 2:
      TypeFor tells the truth.** Widening + `TypeForValue` narrow value face (shared
      `DerivedType<T, Alias>` conditional, Alias=never collapses the unions) + @remarks rewrite +
      rewrite-plan check-off + decisions.v2 §193 amended in place. Gates: primitives.extras/
      primitives/primitives.test tsc clean; primitives.test 194/194; typefor.ttsc.e2e 11/11;
      12 red packages diff-proven identical to baseline. REMAINING from the brief: the lifecycle
      close-out (delete rewrite-plan.md + issue-365 doc) waits on task 1; the OPTIONS FAMILY HOLD
      must be recorded durably during that migration. Flagged, owner call: typefor.ts:76 throw
      says "type token string" (wire-format term or stale?). In `primitives.extras/src/typefor.ts`: every
      spelling-ambiguous `TypeFor<T>` branch widens to `… | NamedType` (callables, array/tuple,
      union, every literal branch incl. undefined/null — covers brands, which derive the BASE —
      exact iterable); honest branches stay narrow (wide scalars → `NamedType`, `never`/bottom →
      `Type`). The VALUE overload does NOT widen (observation never yields a nominal node — its
      own narrow conditional variant, owner-approved). Rewrite `@remarks` to document the union
      (checker can't see spelling; narrow on `kind` first). Fix broken call sites by real `kind`
      narrowing, never casts. Then: check off the rewrite-plan TypeFor halt; correct
      decisions.v2 §193's un-landed paragraph IN PLACE (no lie accepted; value overload narrow)
      + record the ruling. WHEN both inherited tasks are landed and gated: migrate remaining
      permanent content, DELETE `docs/rewrite-plan.md` + `docs/issue-365-inline-discovery.md`,
      closing the rewrite-plan lifecycle. Carried holds from the transfer: OPTIONS FAMILY HOLD
      stands (owner: "leave options alone"; the `() => T` base-slot dissolve NOT approved —
      record it durably during migration); unruled forks get a dated hold note in the tracked
      file, never an invented ruling.
- [x] **COMMITTED `50b6e5fd` (pre-starfish checkpoint; SUPERSEDED by the starfish decorator design for the next pass) — realizer and scope capability mint TOGETHER; Realizer sheds
      `scopeFactory`.** `LifetimeModel.createRealizer()` returns
      `{ realizer: Realizer<L>; scopeFactory?: Func<[IServiceProvider], ScopeFactory<L>> }`
      (named members over a positional tuple; simple models return two views of one object).
      The container arg rides the factory since no container exists at mint time — input
      discipline unchanged (declared contract + model internals only). Absence is known AT MINT:
      a scopeless model's container refuses to synthesize the scope-factory callsite at plan
      time (honest unsatisfiable, not realize-to-undefined). This KEEPS the synthesized-callsite
      route — the floor-registration alternative (model registers a container-taking factory
      descriptor) is DROPPED. Still pending separately: the lose-IServiceProvider-generic +
      lose-createScope proposal (leaning yes, not executed), proprietary model contracts ride
      the same mint shape.
- [ ] **RULED 2026-08-24 — `$<'T'>` hole marker: open templates spell through typefor.** Owner's
      spelling: `if (Type.match(typefor<ScopeFactory<$<'T'>>>(), type))`. Needs: a phantom
      `$<Label extends string>` marker type in primitives (Type-node vocabulary, no runtime
      value); one Go derivation special-case (`$` from `@rhombus-std/primitives` with a literal
      arg derives `Type.generic(label)`, never a nominal address — the marker denotes the hole,
      typefor still never lies); value overload untouched (observation can't yield a hole).
      Replaces string-field matching (`isScopeFactoryAddress`) and the structural
      `Type.imported(name, from, [Type.generic(...)])` template spelling — logging's open
      ILogger registration re-spells as encountered. Engine detection sites (ToCallSiteVisitor
      IServiceProvider/ScopeFactory) switch to hole-template `Type.match` while their receivers
      stay generic; moot for ScopeFactory if the floor-registration rework lands.
- [ ] **Post-port rename slate (owner-opened 2026-08-24; one dedicated pass AFTER the in-flight
      lanes land, CLAUDE.md digest included; ideal name first, MEDI-distance a free bonus).**
      OWNER-ENDORSED 2026-08-24 ("record all your suggestions — i like them"): `ServiceProvider`
      → bare `Resolver` (Claude's lean; `Container` the runner-up, final pick at pass time —
      `Container` survives in `ContainerBuilder` either way); `Scope`/`lifetime` KEEP (place vs
      policy; `IServiceScope` → bare `Scope`); `ServiceDescriptor` → `Registration`; internal
      `CallSite` → `Plan` (a ConstantCallSite calls nothing; the realizer's per-position `site`
      key keeps its name); `serviceType` → `address` (the design language already says address
      everywhere; at realize time pairs with the request). RULED, DI-ONLY: interfaces without
      published concretes DROP the `I` prefix — concretes stay unexported on the
      `Default<InterfaceName>` pattern (di backtrack of the global I-prefix rule; other families
      unaffected). Consequence: the interface is bare `Resolver` (or `Container` — final pick at
      pass time), no `IResolver`.
- [x] **COMMITTED `50b6e5fd` (pre-starfish checkpoint; rulings survive starfish, hosting machinery condemned) — lifetime-vocabulary split.**
      RULED: standard refuses omission (`StandardLifetime` = the three literals; out-of-vocabulary
      registration refused with a naming TypeError, engine-wrapped as LifetimeModelError); tagged
      OWNS omission-means-transient (`tagged<Tags extends string>(): LifetimeModel<Tags |
      undefined>`, optional tag on its factory); omission ≡ undefined ALWAYS — one value, one
      path, never two cases; `ScopeFactory<Args extends readonly any[] = []>` decoupled from
      LifetimeArgument (args = the model's scope-NAMING vocabulary; standard `[]`, tagged
      `LifetimeArgument<Tags | undefined>`); mint field `ScopeFactory<readonly any[]>`, no second
      LifetimeModel generic (rejected: nothing consumes it — cascade for zero reach). Suites
      21/21; di.test 80/181, zero new failures. OPEN FLAG: createScope's typed face still derives
      args from `LifetimeArgument<Lifetime>`, not the model's factory shape — standard's
      createScope admits an ignored optional arg; dissolves if the pending lose-createScope
      ruling lands.
- [ ] **Owner design direction 2026-08-24 (idea stage, NO implementation): scope as a true
      bolt-on via the marker-service paradigm — the "starfish" shape.** A request arrives
      wrapped: `ScopedRequest<T>` (a marker address, like Invoker/ScopeFactory). The plan is
      built normally but NOT realized; the marker's synthesized answer returns a deferred value
      that holds the plan AND exposes hook/callback points at the positions a lifetime engine
      needs (instance-cache lookup before make, store after, scope entry/exit) — so realization
      diverts through the scope engine's inserted callbacks at exactly the right places. The
      engine everts its internals as hooks (the starfish expelling its stomach): scope still
      can't see engine internals, but they're no longer so internal. DESIGN DEVELOPED 2026-08-24
      (still idea-stage, nothing implemented): the wrapper is named **`Starfish<T>`**; a SCOPE
      is an sp impl whose difference from a non-scoped one is that its `getService(T)` resolves
      `Starfish<T>` from the engine-sp and realizes the deferred under its own hooks — no
      ambient state, so the mutable `#activeScope`/`enterScope` router hack dies and interleaved
      async walks stop being a hazard. The ROOT container is itself a scope impl (singletons =
      root-scope caching; the bare engine never reaches users; noop dissolves into "no hooks").
      Hook surface = the three engine seams already on the books (beforeMake/afterMake — the
      Realizer.realize split — plus provider-slot delivery and latebound reentry capture); the
      deferred must thread hooks into everything realization mints (latebound closures re-enter
      under CAPTURED hooks, injected provider slots deliver the asking scope, nested deferrals
      inherit). Realizer stays the model-facing face; hooks are the engine-facing seam; the
      landed mint-together round is the hook surface's first client, extracted from it rather
      than discarded. The walk-threaded hook context is the SAME infrastructure as the
      audit-service frame — build once. Sequencing rec: land the current round first, starfish
      as the generalization pass. SETTLED 2026-08-24 (owner+Claude converged): the starfish
      door is PERSISTED and TWO-STAGE — `Starfish` is ONE non-generic address; its synthesized
      answer is `(hooks) => (request: Type) => any`; a scope acquires the door from its INNER sp
      once, binds its hooks once, and the per-request path is a bare bound call — no per-request
      hook registration, no per-request deferred, no `Starfish<T>` wrapper nodes (the request is
      a value arg; when the payload can be a value, the address encodes nothing). Decorator
      stacking composes at BIND time: a scope decorator answering a door request hands back a
      door pre-composing its own hooks beneath the asker's, so N stacked decorators pay N
      compositions at construction and one bound call per request. Lazy dependency slots, if
      ever wanted, are a separate `Lazy<T>` door. OWNER-RATIFIED FRAMING 2026-08-24: "the scope model is now
      just a decorator pattern on sp" — a scope model is an sp DECORATOR (holds an inner sp,
      diverts realization through Starfish + its hooks); genesis leaning (not yet final):
      di ships engine-only genesis (`di.usingManifest(...).build()` → bare un-augmented
      engine-sp), the scope package's own front door wraps it (`standard.wrap(engine)` → the
      root scope users hold); `Manifest<Lifetime>` keeps the vocabulary in di.core while the
      interpreter (model/realizer/mint) moves wholly into the scope package. Decorator framing
      generalizes: any cross-cutting resolution concern (audit, tracing) is the same shape.
- [ ] **OWNER RULING NEEDED — named-wins typefor derivation for closed generic callables.** The
      Go hole rule (landed) makes OPEN templates derive by name (`ScopeFactory<$<'T'>>` →
      nominal + hole). But a named callable template applied with CLOSED args still derives
      STRUCTURALLY — `typefor<ScopeFactory<unknown>>()` takes the call-signature path and dies
      on the `LifetimeArgument` conditional tuple (and where it survives, emits a func node —
      an address disagreeing with the engine's nominal detection, a typefor lie). The gospel
      text says "a named type yields its interned NominalType address"; honoring it means
      DeriveTyped prefers the nominal spelling for ANY named type before structural
      classification — a repo-wide derivation change (every `typefor<NamedCallableInterface>()`
      moves off `Type.func`/`Type.ctor`), so it needs a ruling + parity sweep, not a patch.
      INTERIM: `ScopeFactory.address` is factory-built with the arg
      (`Type.imported('ScopeFactory', from, [Type.global('unknown')])`) — matches the one-arg
      engine pattern; a user spelling the address via typefor still can't reach the door until
      named-wins lands.
- [ ] **Sequencing conflicts to resolve at go time (owner aware):** the briefs' push-directly
      protocol vs this branch's 23 unpushed commits + uncommitted review round; the briefs'
      claim of an active "plan-async-then-scope" pusher vs this session's picture (the dirty
      set here IS the review round); both tasks edit beside the live lifetime-lane files, and
      the floor-registration rework (if accepted) deletes code the briefs assume stable.

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
- [ ] **RULED 2026-08-24 — the engine IS an sp (starfish design): `Engine` implements
      `IServiceProvider`**, one member, UN-AUGMENTED, never handed to users — scope model
      writers consume it through the same one-door API everyone knows. Scope impls (the root
      scope included) hold the engine-sp and resolve `Starfish<T>` through it; users hold only
      augmented scope impls. The engine's multi-entrypoint contract (`resolveLatebound`/
      `resolveFrame`/`scopeFactory`) collapses toward addresses through the one door. Input for
      the scope-planning lane.
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
- [ ] **mergesynth 5-way `add` guard bug — BLOCKS the ruled addMany→add fold.** Adding an
      `add(descriptors: Iterable<ServiceDescriptor>)` overload as a 5th `add` shape makes the
      synthesized dispatcher break at runtime (`TypeError: undefined is not a function at reduce`
      on even a plain 3-arg ctor add); compiles with zero diagnostics; cleanly bisected — same
      body under a non-colliding name works, fold to `add` fails, toggled twice. The generated
      guard tree in di.core's dist/stage looks wrong only once the 5th shape enters. `addMany`
      stands unchanged meanwhile. Fork to decide: chase the guard-composition defect in
      transforms/ mergesynth, or sidestep with a hand-authored merge strategy for the collision.
- [ ] **examples.app.{with,without}-transformer red (TS2769)** — registration-demo/resolution-demo
      call `new DefaultManifest(model, ...)`-era shapes: `LifetimeModel<unknown>` doesn't match the
      Iterable ctor overloads. Fallout of the ctor/contract rework landing after the examples were
      greened; root `bun run build` fails at these two apps only. Fix = semantics-only call-site
      updates (never fill out demos).
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
      - **Resolve-audit service**: a door giving _access_ (never a copied snapshot) to the details
      of the resolve that constructed its holder — full request type, serviceType, ancestry — as
      a thin handle closing over the engine's per-resolve frame; payload engine-side and lazy.
      Creation-time semantics under caching (a cache hit reuses instance + handle together).
      Replaces the Typeof witness branding. Ancestor visibility ruled fine — no intra-container
      trust boundary, and "who asked for me" is useful. MECHANISM SETTLED 2026-08-24 (still
      deferred): the ScopeFactory recipe verbatim — synthesized callsite, no registration, so
      the realizer's caching never sees it and creation-time binding falls out free — plus a
      walk-threaded context the handle closes over. MECHANISM LEANING (owner 2026-08-24,
      felt-right-not-thought-through): thread an immutable parent-linked frame through the
      realize walk's context arg (each visit conses its site on), and the audit callsite
      returns a closure over that frame. The node itself stays one shared position-free value,
      so plan caching is untouched, and a cached subtree realized under a new request yields
      the new chain automatically — position is never stored, so the stale-position hazard
      cannot exist. (Superseded alternative: a per-plan parent-index — works, but needs
      per-plan keying and can never carry dynamic walk facts; threading can.) Instance-cache
      hits keep their creation-walk handle (creation-time semantics). Engine cost: one
      callsite kind, one visit member, one cons per visit.
      BORDERLINE-FREE PAYLOAD ROSTER (owner directive 2026-08-24: take advantage) — data
      already in hand at the cons or walk-start point, O(1) to capture:
      - Per-frame, at cons: **arg position within the parent's signature** (the
      `site.args.map` index is live at every cons site — answers _which slot_, not just
      which parent); **collection element index** (visitIterable/visitArray likewise);
      **the realizer in effect at that visit** (already a visit arg — records which
      model/scope governed the construction, incl. descendantRealizer swaps); **depth**
      (one int, saves O(n) chain walks).
      - Root frame, once per walk (all sitting in RealizeOptions/the engine entrypoint):
      **genesis kind** — plain resolve vs latebound re-entry vs invocation frame vs
      collection ask; **the originating facade IServiceProvider**; **a monotonic engine
      resolve ordinal** (creation ordering across the container). CAVEAT: a latebound
      re-entry's arg VALUES are also in hand (`#args`) but keeping them is NEW retention —
      pins caller values for the handle's lifetime; everything else listed is already
      container-pinned.
      - Plan-time (store on the node, position-free, zero walk cost): an open registration's
      **closing bindings** (`Answer.generics` at fromAnswer) — "how my template closed".
      - Bonus, same data free: the failure paths (`#realize`'s catch, cycle detection) hold
      the frame when they throw — attaching the ancestry chain to LifetimeModelError/
      CycleError diagnostics is an ERROR-SURFACE change to green-light explicitly, not
      plumbing.
- [ ] **Mergesynth deeper enumeration — owner call open:** verbose diagnostics now enumerate a
      member's weakened positions, but inside one position's recursive composition
      (object/union/tuple guards) the first uncheckable reason still wins (`guardForType`'s
      `firstReason`, ~15 composition sites). Enumerating those too is a sizable refactor —
      wanted or not?
- [ ] **Lifetime-lane queue.** LANDED AND COMMITTED 2026-08-24 (owner-accepted): the di2 pass
      (front door, `manifest.build()` demolished, examples greening, suite migration),
      IServiceProvider promoted to di.core (`SERVICE_PROVIDER_FROM` flipped; `Lifetime = unknown`
      generic; `createScope` as a di.core augmentation resolving `ScopeFactory.address` via
      `getService` and translating to `ScopeFactoryUnavailableError`), the LifetimeModel/Realizer
      contract split (`createRealizer()` minted once per `build()`; engine holds only the
      Realizer), and the Manifest `include` verb. STILL UNCOMMITTED: standard.ts/tagged.ts + their
      two suites. LANDED ON DISK 2026-08-24 (uncommitted, owner review pending): the
      ScopeFactory-callsite rework — ScopeFactory OUT of addModelServices (context-free, `[]` in
      all three models), synthesized via its own callsite kind (invoker precedent, synthesis tail
      so a manifest registration still wins), realized through `Realizer.scopeFactory(container:
      IServiceProvider): ScopeFactory | undefined` (explicit param RULED: the factory depends
      only on its declared contract + model internals, never engine behavior — the interim
      attachContainer hook was rejected and deleted); noop returns undefined → createScope
      translates to ScopeFactoryUnavailableError. Smoke-verified, zero test-count deltas. STILL
      TO DO from the stab scope: the ~80-line Scope/Router/ScopeProvider dedup collapse.
      Historic remainder of the older queue: the genesis front door
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
