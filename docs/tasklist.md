# Tasklist

Open work items. An item lands here when it is decided but not yet done; it leaves when the change is in.
Architectural rulings belong in `decisions.user.md` (gospel) or `decisions.v2.md` — this file tracks execution only.

## Execution run — 2026-08-19, 22:05

This doc is executed on that date. Everything needed to run it unattended is written here; nothing depends on a
conversation the session cannot read.

**The orchestrator is a CLOUD agent** (owner order 2026-08-20; the local timer launch is deleted). It is
dispatched from the owner's session, runs on Fable, checks this branch out from GitHub, and executes this doc
directly — the `/go`//`/ready` skills do not exist in its environment, so it applies this doc's own gap-handling
rules in their place. It pushes to `IServiceManifest-repair` as work lands (authorized), which is also how the
owner's machine sees progress.

**When the readiness check reports gaps, fix and retry — under two limits.** A gap that is OBVIOUS is auto-fixed
on the spot and `/go` re-run, no asking. Retry ONLY when something concretely changed since the previous attempt:
a file written, a task added, a fix applied. Re-running against an unchanged board is not a retry, and the second
identical verdict is not new information. Five sequential failures halt the run regardless of how much changed
between them.

A gap that is genuinely nuanced — a decision, a reading of intent, anything where being wrong would cost real
work — halts immediately, without spending a retry. Halting is the correct outcome there, not a failure: report
and stop.

**Compile-heavy work goes to cloud workers.** Parallel builds and gate runs are what hurt on this machine, so
dispatch them as agents with `isolation: "remote"` rather than running them all locally. A remote worker checks
out from GitHub and cannot see the local tree, so the orchestrator COMMITS AND PUSHES to
`IServiceManifest-repair` before dispatching one, and the worker's work is against that pushed commit. Committing
and pushing freely to enable this is authorized. If remote isolation is unavailable at run time, fall back to
local workers rather than skipping the verification.

**Where the work happens (owner ruling 2026-08-19: directly in #274).** The run works FORWARD on
`IServiceManifest-repair` in the main checkout — no lift, no reset, no PR-back ceremony. First action: if the
working tree is dirty, commit it as-is (`--no-verify` savepoint); then fix forward. Worktrees are used ONLY
where they buy something concrete — a lane running concurrently with another (two agents cannot share one
working tree) or a change kept apart because integrating it early would cost more conflict-resolution than it
saves. A worktree lane merges back into `IServiceManifest-repair` the moment it lands; pushing the branch (and
lane branches, which is what feeds the cloud workers) is authorized throughout.

Changes the run is unsure about still go to their OWN separate worktrees, unmerged, reported by branch name.

**Out of scope: `refactor-toolkit-platform`** (owner ruling 2026-08-20). The toolkit-reorg branch stays held —
its npm packages are unpublished placeholders, publishing is the owner's job, and the run neither merges nor
deletes it. Leave the branch and its worktree alone.

The tree does not build or even format — much of it landed with `--no-verify`. One known break:
`tests/diagnostics.test/test/listener-config-factory.test.ts:75` has a stray `Manifest<any>` pasted ahead of a
`let manifest: Manifest = new DefaultManifest();`. Others are expected; finding and fixing them is the job.

**Order.** Apply every requirement in this doc, then work through whatever build errors remain.

Permitted with no discussion:

- typos;
- code that was never converted to the patterns this doc describes.

Not permitted:

- design decisions;
- code that does not comply with a pattern already established here or in the codebase.

**Vestigial code: delete aggressively — JUST DON'T BE WRONG** (owner order 2026-08-19). Dead helpers, orphaned
imports, retired mechanisms, commented-out corpses: remove on sight, no hedging, no "kept for reference".
The bar for "vestigial" is PROOF, not vibes — verify nothing reaches it (references, re-exports, white-box
seams, rhombus-std.json entries, tests) before the delete; a wrong delete costs more than ten kept corpses.
Where reachability is genuinely uncertain, that's a not-vestigial verdict, not a smaller delete.

Those two lists are the INTENT, not an exhaustive catalogue of what will come up. Where a situation is not covered,
read for the intent — the owner is not available to arbitrate mid-run, and a change that needs arbitration is by
definition one of the two forbidden kinds.

**Where the work lands.** Everything that satisfies the rules above is committed directly to
`IServiceManifest-repair` (#274) — serial work in the main checkout, worktree lanes merged in as they land. A
change the run is fairly confident about but cannot guarantee against those rules stays in an UNMERGED
worktree, one per such change, reported by branch name at the end.

**Milestone.** There must EXIST a revision on `IServiceManifest-repair` with every item in this doc done, nothing
half-applied, and the gates green — reached before the first async/scope commit, so it stays reachable afterwards.
It is a commit to produce, not a checkpoint to stop at: nothing waits for review there, and the run continues
straight through it.

**The async/scope gate — and its total independence from everything above.** `docs/async-scope.md` is expected to
exist by the run. Whether it exists, what it says, and whether it is blessed change NOTHING about how this doc is
executed: the work above runs to completion either way, in the same order, to the same standard. Do not check for
the file first, do not let its absence shorten the run, do not let its presence pull work forward. Look at it only
once everything above is done.

Implementation of anything in it is then released by ONE thing: the document saying, in those letters, that it has
been **blessed** by the owner. No synonym releases it — "signed off", "these requirements are finished and ready",
"approved", "final" and every other phrasing leave it unimplementable. Read closely for WHAT was blessed: the
blessing may cover only a portion of the document, and only that portion is released. Absent the word, the run
simply ends where the tasklist ended — report that async/scope was not released, and stop. That is a normal
ending, not a failure, and it takes nothing away from the work above.

## Execution plan — optimize HARD for ASAP

Parallel lanes from t=0. Merge conflicts are NOT globally avoided: a conflict that is mechanically easy to
resolve (rename-vs-rewrite on different lines, package.json/tsconfig JSON maps, disjoint-file churn) is CHEAPER
than the serialization that would prevent it — let it happen and resolve at integration. Serialize only where
edits are design-coupled (two lanes rewriting the same member's shape). Every lane commits early and often to
its own branch; the integrator merges each lane the moment it lands, not in one big-bang at the end.

- **L1 — critical path (ONE agent, serial internally).** The di.core/di repattern core, in this order:
  (1) the #365 back-out in di.extras (restores builds — everything else profits immediately);
  (2) the type-door collapse into asClass/asFactory; (3) ConstantType + addValue + the uniform `add`;
  (4) the `describe` chain + its inline entry; (5) U6's builder.ts + ServiceProvider.ts legs (they land last
  because the door collapse deletes most of them). L1 authors all new code ALREADY in the target naming
  (`address`, `ServiceType`, no "token") so the L4 rename sweep never has to touch its output.
- **L2 — Go engine (parallel).** transforms/: aliased-union naming with the exportedness gate, AliasType
  derivation + node + factory (the primitives/Type.ts edits ride here — different files from L1),
  `Hole`→`Generic` rename, mergesynth ctor/func split. Parity e2es updated per change. Touches L1 only at the
  parity suites — integrate freely.
- **L3 — options family (prep now, core gated).** Immediately: the extras dep edges, the addOptions face fix,
  hosting's tsconfig.ci.json fix. The sentinel-slot rewrite + Keyed acceptance start the moment L1(3) and L2's
  Keyed derivation land — do not wait for L1 to finish entirely.
- **L4 — mechanical sweeps (parallel, file-scoped agents).** getOrInsert swap, groupBy, lazy-thrown strings,
  assertNever style, iterable `replace` overloads, smoke.ts audit/port, `configureContainer` degeneralization,
  errors-demo reimplementation, and the token→type + address renames over every file OUTSIDE L1's blast
  radius (di.core/src/builder.ts, ServiceProvider.ts, the registration augmentation files). After L1 lands, one
  cheap re-sweep over its files for any straggler naming.
- **L5 — exports rework (parallel worktree).** The conventional-exports overhaul + the feat-src-first-exports
  salvage-check-and-delete. Its conflicts with other lanes are package.json/tsconfig JSON — easy merges,
  tolerated. Integrates LAST before the final gate so resolution-behavior changes are verified once, not per
  lane.
- **L6 — integrate & finish (serial tail).** Merge lanes as they complete; full gate; the comment sweep over
  the final diff (pure churn — never runs concurrently with code lanes); commit relabeling; milestone commit
  directly on `IServiceManifest-repair`; only then the async/scope gate check. L1 and this tail run in the main
  checkout on the branch itself; only the concurrent lanes (L2/L4/L5) take worktrees, per the ruling above.

Cloud workers carry gate runs and any lane whose file set is disjoint from the local tree state, per the
remote-worker rules above.

## Finish converting `Type | string` away (U6)

A parameter that names a type takes a `Type` and nothing else; a consumer holding a string writes `Type.from(...)`
at the call. Most sites are already converted by hand. What remains:

- [ ] **A parameter naming an address is spelled `address`, not `type`.** Faces are done; the internals
      still name the address `type`: `libraries/di.core/src/ServiceScope.ts:21,23`;
      `libraries/di.core/src/Errors.ts:44,46,86,90,105` (readonly `type` member);
      `libraries/di.core/src/address.ts:10` (`withKey`);
      `libraries/di/src/internal/Engine.ts:37,46,63,105,114`; `libraries/di/src/internal/Plan/Plan.ts:114`;
      `PlannerVisitor.ts:40,71,191,211,246`; `libraries/di/src/internal/ServiceScope.ts:69,73`. Several of these
      files carry uncommitted owner edits — re-verify lines before editing.

**Exempt — leave alone:** `libraries/primitives/src/Type/Type.ts` `:162` (`Signatures.from`) and `:265`. These
are the `from`-family boundary converters — the data-input surfaces where a string is legitimately accepted and
turned into a node — so they keep their string legs. The re-sweep must not flag them.

## Kill the sentinel slots

`libraries/options.augmentations/src/option-types.ts` fabricates global type names and registers values under them
that have no relationship to the name. `add(startupValidationTargetType(), optionsAddressType(type))` declares an
address nothing in the program is ever of, and stores a `Type` node under it. Every one of these is a bucket
key wearing a type's clothes, with `[optionsType]` standing in for a composite key component rather than a type
argument.

- [ ] **The `() => T` base-slot shape — HELD** (owner 2026-08-21: "leave options alone for now").
      `libraries/logging.config/src/LoggingBuilder-Config-augmentations.ts:64` still registers
      `() => new LoggerFilterOptions()` — a class registration wearing a lambda. Dissolving it into an ordinary
      class registration is the eventual direction; nothing is scheduled and nobody touches the options family
      for this until the owner reopens it.
- [ ] **`diagnostics.core` still fabricates package-qualified globals.**
      `libraries/diagnostics.core/src/types.ts:28,:44` (`METRICS_OPTIONS_TYPE` / `TRACING_OPTIONS_TYPE`,
      `Type.global(\`@rhombus-std/diagnostics/...\`)`) — convert to the real addresses`Type.imported('IOptions', '@rhombus-std/options', [...])` like the options family. A repo-wide
      sweep found no other instance.

## Authoring surface

- [ ] **Prefer inline `typefor<T>()` calls over `COMMON_EXPORTED_TYPES`-style shared Type consts.** Remaining:
      `libraries/di.core/src/resolver.ts:12` (`RESOLVER_TYPE`, 10+ consumers) and
      `libraries/diagnostics.core/src/types.ts:22-51` (8 exported `*_TYPE` consts) — both packages stage through
      ttsc so this is unblocked.

- [ ] **Sugar acceptance bar.** `options.augmentations/rollup.dts.mjs:14` does not list `di.extras` in externals
      — nothing leaks today; close the letter of the bar.

- [ ] **Collapse the type door into the implementer door — the sugar leg.** The primitive collapse landed; what's
      left is the one-argument-shorter sugar in `di.extras` deriving the implementer type, which doesn't exist
      anywhere yet:

      ```ts
      asClass<T extends Ctor>(this: …, ctor: T): … {
        return this.asClass(ctor, typefor<T>());
      }
      ```

- [ ] **`typefor<T>()` on a named type must type as the node it yields.** `TypeFor<T>` narrows only the two
      callable kinds and drops everything else to the full `Type` union, so `typefor<Type>()` types as `Type` when
      the value is an `ImportedType`. A named type argument types as its `ImportedType` (an ambient one as its
      `GlobalType`) — the fallback narrows to `NominalType`.

      An unnamed type argument is not an error: `typefor<{ host: string }>()` yields an `ObjectType`, the same
      structural node `schemaof` would build. Narrow no further than that — the named case is the only one a call
      site demands today, so everything else keeps falling back to `Type`.

A `Keyed<Type, K>` sketch demonstrating the shape — a real address carrying a key, with a value genuinely
assignable to it, and the factory's own signature supplying its injection list:

```ts
export namespace ServiceManifestValidateOnStartAugmentations {
  const valKey = `@rhombus-std/options.augmentations/startup-validation-target`;

  export function validateOnStart(this: Manifest<string>, type: Type): Manifest<string> {
    return this
      // Accumulate the target in the flat startup-validation slot. This is the one slot holding the
      // composed `IOptions<T>` address rather than the bare `T` every other verb keys on, because
      // StartupValidator resolves each target and reads `.value` off it -- so the target has to be
      // resolvable.
      .add<Keyed<Type, typeof valKey>>(Type.imported('IOptions', '@rhombus-std/options', [type]))
      // One validator serves every target: its factory reads the whole target list off the resolver
      // at start time, not at registration.
      .tryAdd<IStartupValidator>(factory, typefor(factory));
  }

  function factory(resolver: IServiceProvider, startupType: Array<Keyed<Type, typeof valKey>>): IStartupValidator {
    return new StartupValidator(resolver, startupType);
  }
}
```

Three things it establishes: a fabricated global is replaceable by a real type plus a key; `Keyed<T, K>` in the
service-type position derives to the tag; and `typefor(factory)` supplies the whole injection list from the
factory's own parameters, so no hand-written `Type.func` or `RESOLVER_TYPE` is needed. The architecture for the
whole set is decided fresh when the slots above are rewritten, so this is a demonstration rather than the target.
(`AliasType` stays HELD per §191, owner re-confirmed 2026-08-21 — nothing from that thread is scheduled.)

## Inline discovery

- [ ] Issue #365, corrected scope (owner ruling 2026-08-21) — `registerInlineBodies` marker calls become a
      discovery channel **IN ADDITION TO** the `rhombus-std.json` publish list, which STAYS: not all inlinables
      are augmentations, so the JSON mechanism is not retired. Registrations ACCUMULATE, partitioned however
      the author likes: one `registerInlineBodies` call may supply a single overload's body, several overloads'
      bodies, or all of them, and further calls may add more — the engine's unit is the (member, overload
      signature) pair regardless of which call carried it. Selection (owner ruling 2026-08-21, supersedes the
      longest-compatible rule): **the engine performs NO overload resolution of its own** — the overload the
      checker resolved the call to (the one the user's intellisense displays as selected) IS the selection, and
      the engine inlines the body registered for exactly that signature. A resolved face with no registered
      body is a loud build error, never a nearest-match substitution — the inlined reality must always be the
      signature the author saw. A
      rest-parameter body is one authoring choice among several — permitted where written, NEVER a requirement
      of the mechanism. Go side only.

- [ ] **The `*.extras` repattern, the TypeScript half of #365.** Once marker discovery lands, the augmentation
      sets' instance entries move out of `rhombus-std.json` and into per-overload `registerInlineBodies` calls
      (the JSON list stays for non-augmentation inlinables). The `getService` family keeps per-overload bodies —
      each registration carrying its own signature + implementation — not a single collapsed rest body. Blocked
      on the Go half landing first.

## Housekeeping

- [ ] **Dependency categories: RULED 2026-08-21 — the tree is right; peers matter only at the published
      boundary.** In-repo, source-first resolution yields one module instance by construction, so plain
      `dependencies` on identity-load-bearing packages (`primitives`, `di.core`, config providers) are correct
      today; the identity invariant bites only where npm nesting can mint a duplicate, i.e. for PUBLISHED
      consumers. Owner ruling (2026-08-21): NO peer deps — plain deps everywhere, and the duplicate-copy hazard is
      covered by a LOAD-TIME SINGLE-INSTANCE GUARD, approved to implement now (fed to the active run): each
      identity package (`primitives`, `di.core`) stamps a global-symbol sentinel (e.g.
      `Symbol.for('@rhombus-std/primitives/instance')`) at module load; a second loaded copy sees the stamp and
      throws immediately with a message naming both module paths and telling the user to deduplicate their
      lockfile. Louder and more portable than peer warnings; peers remain only a fallback if the guard proves
      insufficient in practice.
- [ ] `libraries/di/src/augmentations/Manifest-ContainerBuilder-augmentations.ts` uses the retired
      `extends Flatten<typeof Ns>` shape, with its docs on the namespace rather than the face — convert to the
      canonical shape (one `declare module` block carrying the faces, docs on the face, `registerAugmentations`
      calls per overload group).
- [ ] `libraries/di/src/augmentations/ServiceProvider-resolution-augmentations.ts` is an empty stub — an empty
      `declare module` interface, `registerAugmentations({})`, and 4 unused imports. Dead scaffolding: delete it
      or fill it, per the vestigial rule — verify nothing imports it first.
- [ ] `tests/mergesynth.ttsc.e2e/test/mergesynth.test.ts:285` still describes `registerAugmentations`/`augment`'s
      parameter as `string | Type`; the parameter is `Type`-only now.
- [ ] **Replace the one remaining lazily-thrown string.**
      `libraries/di/src/internal/Plan/PlannerVisitor.ts:36` throws `` `wtf mate...` `` in
      `VisitDisposerFactory`'s `[Symbol.dispose]`, with no matching `catch` anywhere — it doesn't qualify for the
      intentional-control-flow exemption, so convert it to a real Error. The file carries uncommitted owner
      edits — re-verify the line before editing.
- [x] **Conventional-commit labels on the owner's commits — CLOSED, no rewrite.** Authorship is
      already uniform (`Thomas Butler` on all 601 branch commits). The repo is squash-only, and a
      squash takes its parsed title from the PR while the individual messages become body text, so
      the unprefixed subjects never reach semantic-release. The branch's `BREAKING CHANGE:`
      trailers make the release a major on their own. Relabeling would buy nothing and cost a
      force-push under a lane holding uncommitted work.

## Claude's lane — 2026-08-30

Only work this session owns. §229 model-owned captivity, the scope-issue handoff, #274/#366, the
knip sweep and both read-only audits belong to the review lane below.

**In flight**

Nothing. Every item this lane owns is committed.

**Complete**

- [x] Instance disposal in the lifetime model.
- [x] `Generic`/`Keyed`/`T` moved to `primitives.extras`, `$` dropped, scope machinery grouped
      under `lifetime/` with the models beneath it.
- [x] `Type.isMatch`, replacing the two `bindGenerics` call sites that discarded the bindings.
- [x] di.core stops re-exporting `Type`/`ImportedType`/`NamedType`.
- [x] The whole repo adapted to the replaced API surface — `addMany`, `withAddon`,
      `configureProvider`, `validation`, `ServiceProviderOptions` — across hosting, logging,
      caching, options, diagnostics, the examples, and every test package.
- [x] Every test package typechecks, not merely runs.
- [x] An open address answers `false` to control recognition, so asking at a template reaches the
      engine's refusal instead of escaping as a raw `Error`.
- [x] `validateScopes` removed from hosting's `ServiceProviderOptions`, captivity being the
      keeping model's own concern. A depender adaptation, so it follows di rather than waiting on
      a ruling of its own.

## Review lane (Fable session) — 2026-08-30

Only work this session owns; the lane above is another session's.

**In flight**

- [x] §229 captivity is model-owned — landed (399c3352): generic seam deleted;
      `validateStandardCaptivity` middleware; `standardLifetimeAddon({ validateScopes, validateOnBuild })`,
      independent, both default on; model-local `ScopedAtRootError` root refusal; §225 reach rule
      model-contained; disposed-factory guard in both models; hosting side done by the other lane.

**Complete**

- [x] The five scope issues from the owner's handoff — retention closed by a parent-link
      constructor argument, a cleared kept map and a cleared binding memo; one-shot `bindProvider`
      behind a read-only accessor; undefined threaded state falls through in keeper and prober; one
      lazy `#drainTeardown` walk under both teardown paths; `typefor` teardown addresses. (3246976e)
- [x] §229 recorded (948c6738) and aligned to the middleware⇄addon rule.
- [x] §225 instance disposal implemented — committed by the owner.
- [x] §227 VisitorContext refactor reconciled into the async implementation — committed by the owner.
- [x] "site" vocabulary sweep across code and docs; `Type.match` in the async-delivery
      recognizers; `isThenable` moved to primitives' toolkit — committed by the owner.

**Awaiting the owner's word** (Claude-defaulted readings, each flagged in the diff it shipped in)

- [x] Standard model at runtime — RULED: matches the reference exactly; `validateScopes` /
      `validateOnBuild` switches, both default on; refusal only while `validateScopes` is on.
      Follow-up change queued behind the in-flight §229 workflow.
- [x] Disposal: sync dispose meeting a promise product — RULED: out of reach if the container
      never awaited it (not released, holder owns it); in reach if delivered through
      `resolveAsync`/a settled boundary — async disposal required, sync throws the async-only
      clause. `releaseOnArrival` goes away; the claim records whether the container awaited it.
- [x] Disposal: the tagged teardown is tag-agnostic — RULED ok (simplest reading: the mirror is the
      resolution-driven registration mechanism, not the template shape). No change.
- [x] Disposal hazard — RULED mirror the reference: `openScope()` on a factory whose enclosing
      scope is disposed throws `DisposedScopeError`. Queued with the lifetime follow-ups.
- [x] Hosting drops `ServiceProviderOptions.validateScopes` — done by the other lane under §229;
      surfaced as a public hosting API removal. If hosting ever composes on `standardLifetimeAddon()`, the
      reference's two flags map 1:1 onto `standardLifetimeAddon({ validateScopes, validateOnBuild })`.

**Queued** (carried from the burned session handoff; each behind the item above it only where stated)

- [x] Lifetime follow-ups — landed inside 399c3352.
- [x] Async: docs, tests, examples and the `resolveAsync` transformer-parity e2e — feature doc
      (78122683), gap-filling tests for gather/reach/AsyncIterable (0147669b), the resolveAsync
      demo in both resolution-demo.ts twins (a4b3dbf3), and the inline.ttsc.e2e parity fixture
      (f8aa90da). Gates green: di.test 258/258, inline.ttsc.e2e 20/20; every touched file is
      dprint-clean (whole-repo `format:check` still fails on the reinvention table above, unrelated
      to this item).
- [x] Captivity validator: skip `ConstantType` products — already true after the §229 rewrite (a
      value carries no lifetime datum and its plan node ends the walk without descending);
      regression test added (989e7851).
- [x] §210 captive-error label wording (07c9a9fb): `CaptiveDependencyError` named the captor "a
      singleton" unconditionally, wrong vocabulary for a shared di.core error under §210's
      generalized tiers — reworded to name the actual problem (a longer-lived keeper outliving a
      shorter-lived dependency) without asserting which tier. `Audit` placeholder wording
      (90c77ff3): named the real cause (this container never installed the addon's hooks) and the
      fix (`useAddon(auditAddon())`) plainly, dropping the "filing this registration by hand"
      indirection. `Behavior` hover-doc IDE check: OK, no edit — verified via the TypeScript
      compiler API that hovering `Behavior` at every import site resolves through the alias to
      `Behavior.ts`'s own TSDoc.
- [x] Diagnostics knip pass: no removals — every finding in `diagnostics`/`diagnostics.core` is
      either the repo-wide `*Augmentations` namespace false positive (declaration-merging, every
      package has it), a deliberately unwired public primitive the files' own doc comments call
      out as not yet driven by a runtime this repo doesn't have (`instrumentRuleMatches` &
      siblings, `IObservableInstrumentsSource`, `getMetricsManifest`/`getTracingManifest`), or the
      `@rhombus-std/di.extras` devDependency the `add<T>()` sugar in `manifests.ts` needs for the
      ttsc inline-body transform, invisible to knip for the same reason `ttsc`/`@ttsc/unplugin`
      already are.
- [x] Bench re-run — SUPERSEDED by the owner's 2026-08-30 instruction to dig di-classic out of tag
      `di2-handoff` (9aa32c95) and benchmark it against this branch. Both engines built and measured
      as their SHIPPED dist bundles, one harness copied verbatim into each side, 15 interleaved
      rounds pinned to one core, minimum per scenario. Result: against classic, this engine on the
      `standard` model is ~6-12x slower on uncached paths and ~2x on cached ones, worst at scope
      creation; on the `noop` model it is ~1.7x (median), beating classic on the 10-wide graph. The
      lifetime model, not the resolution engine, carries the gap — `standard` costs ~3.8x `noop`.
      Suites live in the scratch worktrees `+di-classic-bench` / `+di-current-bench`.
      Two caveats of record: `enumerable-5` is not like-for-like (classic has no collection concept,
      so it is a keyed regex key-scan), and classic ran with `validateScopes`/`validateOnBuild` off —
      their documented defaults — where `standardLifetimeAddon()` defaults both ON, which is not yet priced.
- [ ] Endgame shape (owner-ruled 2026-08-30): #274 merges LOCALLY; then the squash plus the
      depender fixes that make build+tests green go up as ONE commit; #366 closes then.
- [x] Two audits LANDED (wf_dfa573c3-c7a, 2026-08-30): defects (Fable scan+verify;
      verified single-obvious fixes applied by a non-Fable agent, committed on landing; the rest
      recorded in '## Audit findings') and reinvention (Fable scan+verify vs a shelf inventory;
      pointer table + members-that-should-not-exist list, recorded here and shown to the owner).
      Scope: di+di.core deep; di.extras, di.extras.options, options, options.augmentations;
      primitives(+extras) capped.

## Audit findings — 2026-08-30

**Defects — open**

- [x] `add(manifest)` vs `add(registrations)` dispatch — NOT a defect (owner-ruled 2026-08-30):
      the declared `add(registrations: ButNot<Iterable<Registration>, Manifest>)` overload is the
      contract, mergesynth handles the runtime dispatch for it, and the
      `instanceof DefaultManifest` inside the Iterable arm is double-safety only.
- [ ] `libraries/options.augmentations/src/Manifest-Options-augmentations.ts:56` — the
      one-argument `addOptions(T)` door captures a single container-resolved base instance and
      re-runs the mutating configure pipeline on that same object for every `.value` read and
      reload (vs. `makeBase`'s fresh instance per run), so deleted config keys never clear and
      appending configure steps compound on every read. Saved but PUNTED with the depender
      adaptations (owner-ruled 2026-08-30); all depender work is sequenced AFTER the #274 merge —
      not raised before then (owner-ruled 2026-08-30).

**Defects — autofixed**

- [x] tryAdd same-batch duplicate: changed filter-over-original to reduce that tests each
      candidate against the accumulated manifest (`Manifest-Registration-augmentations.ts:121-127`).
- [x] `build()` one-shot Iterable: materialized each installation's registrations with
      `Iterator.from(...).toArray()` before chaining into the manifest (`di.ts:89`).
- [ ] `CompositeChangeToken` no-latch leak
      (`libraries/options.augmentations/src/CompositeChangeToken.ts`): the local latch-less class
      multi-fires and never detaches; the fix is composing primitives' `CompositeChangeToken`.
      Autofix reverted as out of scope — saved but PUNTED with the depender adaptations
      (owner-ruled 2026-08-30); sequenced AFTER the #274 merge — not raised before then.
- [x] `MatchVisitor` prototype-chain false positive: replaced `name in subject.members` with
      `Object.hasOwn(subject.members, name)` (`MatchVisitor.ts:89`).
- [x] `isAllThere` falsy-element false negative: replaced `.every(Boolean)` with
      `.every(item => item !== undefined)` (`is-all-there.ts:3`).

**Reinvention**

Rulings (owner, 2026-08-30): `first` and the `is*` guards (`isDefined`, `isUndefined`, `hasValue`,
`isFunction`, …) are comprehension helpers — used ONLY to replace a lambda (`.filter(isDefined)`,
`.map(first)`); never a standalone call, never the `*try` helpers, and no work converting existing
non-comprehension code to them.

Applied: the three `.filter(isDefined)` rows (`di.ts`, `Registry.ts`, `PlannerVisitor.ts`) — 07d9bc5e.

Dropped by the rulings (standalone `is*` conversions): `di.core/src/Manifest.ts:48`,
`di/src/ServiceProvider.ts:14`, `options.augmentations/src/configure-manifests.ts:68`,
`options.augmentations/src/Manifest-Options-augmentations.ts:94` and `:118`,
`options.augmentations/src/ConfigConfigureOptions.ts:17`, and
`di/src/internal/Plan/PlannerVisitor.ts:196` (`members.some(p => !p)` + cast → standalone
`isAllThere(members)`; note the conversion would also have deleted the `as Plan[]` cast).

Remaining — APPLIED (1cc4cde8; factory `address` consts kept per ruling with tagged's `: Type`
widening; teardown consts deleted — the affected test hand-rolls the address, per the ruling that
where typefor is unavailable (all of tests/), hand-rolling is the path; model errors onto
`DiError`; comprehension respellings; typefor-derived option slot types):

| should have used                                                                                                                              | used instead                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `iterable(() => this.#enclosing().drop(1))` (`@rhombus-toolkit/obj`)                                                                          | hand-built `{ [Symbol.iterator]: () => ... }` object literal — `libraries/di/src/addons/audit-addon.ts:35`                                                   |
| `this.#enclosing().find(isDefined)`                                                                                                           | `this.#enclosing().next().value` — `libraries/di/src/addons/audit-addon.ts:31`                                                                               |
| `iterable(() => Iterator.from(plan.types).map(inner => self.visit(inner, context)))` (`@rhombus-toolkit/obj`)                                 | hand-built `{ *[Symbol.iterator]() { ... } }` object literal — `libraries/di/src/internal/Plan/RealizeVisitor.ts:191`                                        |
| `!this.#registry.getMatches(promised).some(isDefined)`                                                                                        | `.getMatches(promised).next().done` emptiness probe — `libraries/di/src/internal/Plan/PlannerVisitor.ts:112`                                                 |
| `registry.getMatches(address).some(isDefined)`                                                                                                | `!registry.getMatches(address).next().done` emptiness probe — `libraries/di/src/internal/Plan/Plan.ts:271`                                                   |
| `isCtorRegistration(left)` / `isFactoryRegistration(left)` / `isValueRegistration(left)` — this module's own guards, already used by `kind()` | `'ctor' in left` / `'factory' in left` / `'value' in left` hand-rolled branches in `equals()` — `libraries/di.core/src/Registration/op.ts:40`                |
| `typefor<Audit>()` inline at each use site                                                                                                    | hoisted local `const address = typefor<Audit>()` — `libraries/di/src/addons/audit-addon.ts:86`                                                               |
| `typefor<StandardScopeTeardown>()` inline at each use site                                                                                    | hoisted address const `StandardScopeTeardown.address` — `libraries/di/src/lifetime/models/standard.ts:44`                                                    |
| `typefor<TaggedScopeTeardown>()` inline at each use site                                                                                      | hoisted address const `TaggedScopeTeardown.address` — `libraries/di/src/lifetime/models/tagged.ts:36`                                                        |
| `extends DiError` (`@rhombus-std/di.core` error taxonomy)                                                                                     | `class DisposedScopeError extends Error` — `libraries/di/src/lifetime/models/standard.ts:48`                                                                 |
| `extends DiError` (`@rhombus-std/di.core` error taxonomy)                                                                                     | `class ScopedAtRootError extends Error` — `libraries/di/src/lifetime/models/standard.ts:56`                                                                  |
| `extends DiError` (`@rhombus-std/di.core` error taxonomy)                                                                                     | `class DisposedScopeError extends Error` (duplicate of standard.ts's) — `libraries/di/src/lifetime/models/tagged.ts:40`                                      |
| `Type.substitute(typefor<IConfigureOptions<Generic<'T'>>>(), { T: optionsType })`                                                             | `Type.imported('IConfigureOptions', '@rhombus-std/options', [optionsType])` — `libraries/options.augmentations/src/option-types.ts:15`                       |
| `Type.substitute(typefor<IPostConfigureOptions<Generic<'T'>>>(), { T: optionsType })`                                                         | `Type.imported('IPostConfigureOptions', '@rhombus-std/options', [optionsType])` — `libraries/options.augmentations/src/option-types.ts:20`                   |
| `Type.substitute(typefor<IValidateOptions<Generic<'T'>>>(), { T: optionsType })`                                                              | `Type.imported('IValidateOptions', '@rhombus-std/options', [optionsType])` — `libraries/options.augmentations/src/option-types.ts:25`                        |
| `Type.substitute(typefor<IOptionsChangeTokenSource<Generic<'T'>>>(), { T: optionsType })`                                                     | `Type.imported('IOptionsChangeTokenSource', '@rhombus-std/options.augmentations', [optionsType])` — `libraries/options.augmentations/src/option-types.ts:30` |
| `Type.substitute(typefor<IOptions<Generic<'T'>>>(), { T: optionsType })`                                                                      | `Type.imported('IOptions', '@rhombus-std/options', [optionsType])` — `libraries/options.augmentations/src/option-types.ts:55`                                |
| `typefor<IOptions<Generic<'$T'>>>()` inline at the use sites (`ensureOpenOptions` lines 35, 37)                                               | hoisted const `openOptionsType = Type.imported('IOptions', '@rhombus-std/options', [hole])` — `libraries/options.augmentations/src/open-options.ts:16`       |

The typefor replacements are ALL in scope — none ride the depender punt (owner, 2026-08-30).
Punted with the depender adaptations: `CompositeChangeToken` (`CompositeChangeToken.ts:9`).

**Members that should not exist** (ruled 2026-08-30: the FACTORY `address` fields stay — a public
convenience for no-sugar consumers; never hoist an address for internal use, and this sets no
habit of minting such fields):

- [x] `StandardScopeTeardown.address` — deleted (1cc4cde8)
- [x] `TaggedScopeTeardown.address` — deleted (1cc4cde8)
- [ ] `CompositeChangeToken` — `libraries/options.augmentations/src/CompositeChangeToken.ts:9` (depender-punted)
- [x] `openOptionsType` — deleted (1cc4cde8)

## Engine cost structure — 2026-08-31

Measurements live in `docs/benchmarks.md`. This section records what the code review of both
engines establishes, and what it predicts.

**Where the orders differ, cold against hot.**

| stage                                 | classic cold            | classic hot                  | current cold | current hot  |
| ------------------------------------- | ----------------------- | ---------------------------- | ------------ | ------------ |
| find the registration for an address  | O(1) hash               | O(1) per node, every resolve | O(n) scan    | not executed |
| plan a resolution                     | O(d·w) interpreted live | O(d·w), re-walked every call | O(d·w·n)     | O(1)         |
| resolve a collection                  | O(1) + O(c)             | O(1) + O(1)                  | O(n)         | O(1)         |
| match an open or generic registration | O(c·g log c)            | O(1)                         | O(n·g)       | O(1)         |

Splitting the columns inverts the story the absolute timings tell. This engine is heavier cold and
structurally lighter hot: the other re-interprets the graph on every resolve, cheap per node but
paid every time, where this one pays once per distinct address and then answers the whole subtree
from a memo. What it loses by on the warm path is constants, not order.

**Where the orders differ.** Address lookup is the only stage differing in order: a registration
is found by scanning the whole registry (`Registry.getMatchesForEither`), where the older engine
hashes a token. Open/generic matching scales the same way — every registration is tested, rather
than bucketing by base token first. Both costs are paid ONCE per distinct address and then
eliminated by the plan memo (`Plan.from`, a `registry → address → args` WeakMap chain), so warm
resolution is amortised O(1) in registry size. Measured directly: a warm resolve performs ZERO
registry scans — 10 at build, 3 on the first resolve of a 3-node graph, none across 1000 further
resolves. Total cold cost grows with (distinct addresses resolved x registrations), which is
startup-bounded.

**Where only the constants differ.** Everything else. The resolve path carries a fixed per-ask
cost of roughly 2.3us plus roughly 600ns per constructed node, fitted across four graph shapes:

| shape         | nodes | extra over the older engine |
| ------------- | ----- | --------------------------- |
| leaf          | 1     | 2882 ns                     |
| factory       | 2     | 3382 ns                     |
| depth-8 chain | 8     | 7467 ns                     |
| width-10 fan  | 11    | 8871 ns                     |

The fixed part dominates a shallow graph and amortises over a deep one, which is why a one-node
resolve costs 9.2x and an eight-deep one 2.2x.

**Two redundancies account for per-ask work, and are the first things to measure a fix against.**

- `Engine.ts:80` folds the entire hook chain afresh on every `getService`, allocating a closure
  per hook per installed behaviour plus a slots array. The snapshot semantics it provides — a
  resolution keeps the chain it opened with — survive a version counter on the install list.
- `ScopeBinding.ts:191` installs `probing` and `keeping` on every dispatch and removes them after,
  so the install list genuinely differs per ask and defeats a naive version cache. The two
  compound: the churn is what makes the rebuild real work rather than a cache hit.

Prediction worth testing: removing both should collapse the fixed per-ask cost, taking a one-node
resolve from ~9x toward ~2x while a deep graph barely moves.

**Cheaper leads, unmeasured.** `constructionForSlot` mints a view object per behaviour per node per
hook. A transient registration reads its lifetime and switches twice per node to conclude there is
nothing to keep — `registration.lifetime === model.transient` short-circuits both hooks, entirely
inside the model. `bindGenerics` allocates a bindings record before knowing whether a candidate
matches.

## Hook chain — design, rework and open verdicts (2026-08-31)

**The shape of the cost.** A warm resolve carries a fixed per-ask cost plus a per-node cost, and
both scale with the number of installed behaviours: roughly 400ns per ask and 260ns per node PER
BEHAVIOUR, measured identically under `noop`, `standard` and `tagged`. The rate being the same
across models is the finding — it is the cost of participating in the chain, not of anything a
model computes. `standard` is two behaviours, which accounts for nearly all its overhead.

**Why it was expensive.** Hooks are added at the end farthest from the engine, which is the most
deeply nested position, so adding one rebuilt all k layers. The per-ask fold allocated a chain
record plus four closures per behaviour, discarded and rebuilt identically on the next ask. The
per-node cost is `constructionForSlot` minting a private view per behaviour per hook, three times
per construction, plus a `states.slice()`, a context spread and an `Object.freeze` per node
regardless of how many behaviours are installed.

**Why the fold could not simply be deleted.** It is what gives a resolution a snapshot of the
install list. Resolutions interleave through `resolveAsync` and several scopes are open at once, so
reading a mutable list live is wrong for any concurrent resolution, not merely for a latebound
closure firing after teardown. Replacing the fold with live arrays passes 253 of 254 tests and
fails exactly that one.

**The design that resolves it: persistence, not promises.** An immutable linked node per hook —
`{ hook, slot, next }` — with `next` pointing outward. Extending allocates one node and shares the
entire tail, so adding a behaviour is O(1) instead of a rebuild, and immutability gives the
snapshot property structurally rather than by copying. Walk direction is free either way: head-to-
tail for farthest-first, recursion applying on the unwind for farthest-last. A promise-like type
would add value-threading and a failure channel we do not want — modelling a veto as a rejection
uses the error channel for a normal outcome. What is worth taking from promises is the immutability
that makes appending safe, not the interface.

**Ruled: the single door.** Everything reaches capability through the container's one resolution
door. Side channels are violations — no `WeakMap` or `Map` keyed on constructions, nodes, scopes or
providers, no module-level registry, no back-channel between a behaviour and the engine outside the
hook contract. Hooks are legitimate only because a behaviour obtains `IEngineHooks` as a service
resolved through that door. Per-resolution data travels in the threaded state slots; capability
travels through the door. Reaching for a `WeakMap` to attach data is the tell that a boundary has
been misread.

**Rework landed, uncommitted.** `libraries/di.core/src/HookChain.ts` is new and holds the layer
node, the four walkers and the `HookChain` value; `Behavior` is types only and its namespace is
gone; `Engine` carries a `#chain` value and a `#freeSlots` list in place of the install array and
the fold. Slots are assigned per behaviour and carried on every layer it mints. Disposal restores
the captured previous head when it is the most recent install and rebuilds only the layers inside
the removed one otherwise. Gates green: di.test 287 pass / 6 skip / 0 fail with no test edited,
lint clean in di and di.core, `tsc` clean across the 15 libraries depending on di.core.

**Adversarial verdicts.** Upheld: in-flight isolation including latebound closures after teardown;
per-behaviour slot isolation across differing hook subsets; farthest-holds-final-authority
uniformly with the middleware form overriding.

Refuted, and PRE-EXISTING rather than caused by the rework — the important one: with several scopes
open, a construction belonging to one scope IS kept and claimed by another's behaviour. Every
scope's `keeping` installs on the one engine-wide chain, bracketed only by the dynamic extent of
`ScopeBinding.dispatch`. While an outer dispatch is on the stack and an inner scope is asked, both
keepings are layers of the chain the inner ask captures; `beforeConstruct` runs farthest-first so
the outer scope can answer the inner ask from its own cache, and with nothing cached both scopes'
`afterConstruct` claim the instance, landing it in two scopes' instance maps. The same precedence
holds under the previous fold.

Refuted, rework-specific and modest: an unimplemented hook is not free, because `RealizeVisitor`
builds `beforeConstruct`'s apparatus — construction record, `states.slice()`, `Object.freeze`,
context spread — before the chain is consulted, on every node even when nothing is installed; and
out-of-order disposal misses the LIFO latch, so disposing many installs oldest-first is quadratic.

**Also ruled this session.** A model may return bare HEAD rather than anchoring a root: `standard`
needs its root because singletons live there, `tagged` does not and pays for a root that can never
own anything. `anchorRoot` conflates capturing HEAD with installing a root layer; capturing costs
nothing at request time because a middleware factory runs once at fold time and can hand back
`next` unchanged. Scope factories wrap the captured HEAD, so N scopes are N parallel lifetime
layers over one shared chain, and a child replaces rather than layers — nesting lives in the scope
graph, not the middleware stack.

**Tagged divergence fixed.** An unmatched tag now resolves transiently instead of throwing, which
is what the older engine does: a scope-tagged registration finding no matching open frame resolves
transiently by default and errors only under opt-in scope validation. `ScopeTagUnmatchedError` had
no product consumer afterwards and is deleted. `standard` already gated its equivalent behind
`validateScopes`, so the two models now agree in shape — though `standard` defaults that flag ON
where the older engine defaults it OFF, which remains a separate divergence.

## Resolution door, late registration and the lifetime models (2026-09-01)

**The door becomes a request object.** `getService(Type)` becomes `getService(Request)` for the
middleware chain and the engine — `IServiceProvider` keeps its own signature. `ServiceProvider`
allocates one `Request` per call and puts itself on it; it is the only `IServiceProvider`
implementation and no others are to be written.

```ts
interface Request {
  readonly type: Type;
  readonly serviceProvider: IServiceProvider;
  readonly [key: symbol]: unknown;
}
```

The index signature declares the mechanism without declaring any contents, so a core type carries no
lifetime vocabulary while addons can still attach what they need. It is `readonly`, with the one
layer that writes casting through `{ [key: symbol]: unknown }` — the cast is the point, since it
makes every write a conspicuous act rather than a facility. `unknown` rather than `any` so reading
forces a cast at the two sites that do it. Attaching happens on the way DOWN, before `next`: the
object is shared with every layer beneath and with the engine, so a write on the unwind is invisible
to everything it was meant for and mutates an object something else may still hold.

A symbol rather than a keyed `properties` map: the map is reachable by anyone who types the same
string, with nothing recording that they did, so cross-addon coupling happens silently. An exported
symbol is equally reachable but only through an import a reviewer can see. It also keeps a `Map`
allocation and its hashing off the per-ask path.

**Standard — the tandem pair.** The addon's `create()` returns a middleware and a scope factory
built together, sharing one lexical symbol. The middleware is the inner half: it installs the whole
lifetime implementation through `Control<IEngineHooks>` once, at fold time, and holds every cache in
that closure. The outer half is the single wrap the scope factory puts over the already-folded
chain, which attaches the scope it closes over. `create()` also returns the pair for the singleton
scope, so the container's own provider is born attached and no unattached provider ever exists to be
handed out. Root and `openScope` mint through the same function or they drift.

The chain is folded by `di.build` and nowhere else; the factory does one additional wrap of the
folded chain, never a re-fold. The engine knows nothing of middleware — no head reference, no chain
of its own beyond hooks.

**How the scope reaches the implementation.** `beginResolve` takes what is being asked, so with the
door carrying a `Request` it receives the `Request`:

```ts
beginResolve: (request, injected) => injected ?? request[SCOPE],
beforeConstruct: c => { const scope = c.state; /* ... */ },
```

One read, at the one point per resolution where reading is defined, straight into the behavior's own
slot; every later hook takes it from `construction.state`. `injected ?? …` keeps nested resolutions
inheriting the enclosing scope, so the fallback only fires at the door, where a real `Request`
exists. No ambient plane, no read-outside-`beginResolve` rule to enforce, and no staleness — a later
attachment on another resolution cannot reach back into one that already filed its state.

**What this settles.** Opening a scope composes rather than installs, so nothing accumulates on the
chain: the cross-scope leak — an outer scope's behavior answering and claiming an inner scope's ask —
is structurally impossible rather than governed by a precedence rule. Per-node cost stops scaling
with nesting depth, since one behavior is installed instead of one per open scope. Two earlier
prerequisites dissolve: nothing needs a resolution entry that accepts injected states, and nothing
needs `useHooks` to hand back its slot, because the behavior reads its own slot through
`construction.state` already.

**`Invoker` stays as it is.** Spelling a late registration as a branded argument —
`Func<[Reg<Ctor<any[], Foo>>, SomethingElse], Foo>`, the `Reg` entries searched alongside the
registry — is refused: a temporary registration produces a value the cache cannot honestly key. The
address is what a scope caches under, and it does not identify the producer, so an instance built
from a registration that exists for one frame would be handed out afterwards to asks that could
never have produced it, shadowing the manifest's own registration for the rest of the scope's life.
Two calls passing different `Reg` arguments would resolve to whichever ran first. `visitInvoker`
keeps building its one-shot registration for the root, and `resolveFrame` stays a separate verb from
`resolveLatebound`.

**A scope never captures a value built from a latebound argument.** The address is the cache key
and it does not capture the arguments, so a `scoped` or `singleton` registration reached through a
latebound call would hand every later caller the value the first call's arguments produced —
`make(clockA)` cached, `make(clockB)` a cache hit whose argument is silently discarded. The taint
propagates upward: a construction is uncacheable when anything in its subtree consumed a latebound
argument, not only the node that read one, and that is a static property of the plan tree — whether
it contains a `LateBoundArgPlan`. `visitInvoker`'s synthesized registration is the same case, its
callable being an argument in all but name.

The engine surfaces the fact and the model acts on it: caching is the model's business, and `node`
is opaque, so one bit has to reach `Hooks.Construction`. Open: whether a tainted `scoped` or
`singleton` registration resolves transiently — matching `tagged`'s unmatched-tag ruling — or errors,
which is louder for anyone who genuinely expected singleton identity.

Latebound calls bypassing the middleware chain is what makes this hold. `resolveFrame` and
`resolveLatebound` call `Plan.realize` directly, so a latebound invocation has no `Request` and no
provider to be re-pointed by: its scope is the one captured where the callable was minted, and its
untainted dependencies cache there and nowhere else. A `Request` on that path would let the same
closure, invoked through a different provider, file its dependencies into a scope it was never
created in.

**Tagged is not designed yet.** The same tools — the request object, symbol attachment, a tandem
pair, composing rather than installing — have to be applied to it and a design reached. Its per-scope
layers discriminate by tag where `standard` has no discriminator, so it may not need the same shape;
what it must not keep is a layer installed per open scope. Two known wrinkles: an innermost blocker
cannot infer "unmatched" from arrival alone, because a matching layer still delegates inward to
construct and claims on the unwind, so both paths reach it identically; and two open scopes carrying
the same tag reproduce the leak in miniature unless same-tag nesting is refused or the walk runs
nearest-first.

### Open, needing a decision

1. **Scope and container disposal.** The caches live in the middleware's closure and the thing a
   caller disposes is a `ServiceProvider`, so closing a scope has to reach back into that closure to
   drop its cache. Same direction across the same boundary as attachment, and it wants the same
   mechanism rather than a second one. The container's own disposal is the same link with the
   singleton scope, not a separate concern.
2. **Does anything install hooks after build?** Scopes compose, `standard` installs once at fold,
   audit and diagnostics install at build. If nothing installs late, the dynamic half of `HookChain`
   — install-after-the-fact, disposal restoring a captured previous head, the slot free list, the
   LIFO latch and the out-of-order quadratic — has no caller and deletes, which moots the two open
   verdicts on the rework rather than answering them. The question is whether adding an addon to an
   already-built container is a supported scenario.
3. **A latebound closure invoked after its scope is disposed.** Its untainted dependencies still
   resolve into the scope captured where it was minted, which may be gone. Part of the disposal
   question above rather than separate from it.
4. **Does the engine get smaller?** `anchorRoot` conflates capturing HEAD with installing a root
   layer and has no remaining job once the root is just a scope the model makes. `ScopeBinding`'s
   dynamic-extent bracketing existed to bound when a scope's keeping was installed; with nothing
   installed it plausibly collapses to minting a provider.
5. **Per-ask `Request` allocation.** One object per `getService` lands on the path the rework was
   clearing, where the measured fixed cost is roughly 400ns per ask. Confirm it replaces an
   allocation rather than joining one.

### Expected payoff, to verify against the benchmarks

Per-node cost constant in nesting depth rather than proportional to the enclosing scopes on the
stack; one lifetime behavior installed instead of two; no chain install or dispose on scope open or
close; and one `bind` or wrap per scope-open in place of the per-ask fold.
