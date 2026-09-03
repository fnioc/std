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

## Resolution door and lifetime models (2026-09-01)

Design recorded as §230. Open:

- [ ] Scope and container disposal: the caches live in the middleware's closure, the thing disposed
      is a `ServiceProvider`, and nothing links them.
- [ ] Decide whether adding an addon to an already-built container is supported. If not, the dynamic
      half of `HookChain` has no caller and deletes.
- [ ] A latebound closure invoked after its minting scope is disposed — part of the disposal item.
- [ ] RULED (owner delegated the call): the per-ask `Request` object is ACCEPTED as an additional
      allocation. It joins the engine's own per-ask `{ context: { states } }` (`Engine.ts`,
      `getService`) rather than replacing it; a two-field literal is noise against the ~400ns floor,
      and folding engine state onto the request would put engine internals on the addon attachment
      mechanism for a gain nobody would measure.
- [ ] Design the tagged model against the same tools.
- [ ] Check whether `anchorRoot` and `ScopeBinding`'s bracketing still have a job.

## Builder shape — owner-prescribed, not yet built

Supersedes §216's two dimensions when it lands: registrations stop being a dimension of their own and
become an addon like any other, so the builder holds one list.

```ts
interface Addon<Lifetime> {
  registrations: Iterable<Registration<Lifetime>>;
  middleware;
}

class Builder<T> {
  static useAddon<T>(addon: Addon<T>): Builder<T>;
  useAddon(addon: Addon<T>): Builder<T>;
  withServices(fn: Func<[Manifest<T>], Iterable<Registration<T>>>) {
    return this.useAddon(ManifestAddon.build(fn));
  }
}
```

The static overload is the lock-on: it infers `T` from whichever addon opens the chain and answers a
`Builder<T>`, and the instance overload then demands that same `T`. Services or the model may come
first and either fixes the vocabulary.

NO ADDON WIDENS THE BUILDER'S TYPE. Every addon is generic in the vocabulary and threads it —
`class MyAddon<T> implements Addon<T>`. Declaring `Addon<any>` is the failure this forbids: it erases
the vocabulary, so the builder locks onto nothing and every later addon passes whatever it carries. A
separate widened interface is therefore not needed and must not exist.

An addon indifferent to the valid scope types is not a real case. One that registers nothing threads
`T` vacuously and is harmless; one that registers complies, because every registration names a
lifetime. `auditAddon`'s `...lifetime: LifetimeArgument<Lifetime>` is that compliance — an addon that
must name one and cannot know which value takes it from its caller — and `diagnosticsAddon`
registering a placeholder under `lifetime: undefined` was simply not complying.

An addon that only works under certain vocabularies says so through its CONSTRAINT —
`class MyAddon<T extends StandardLifetime> implements Addon<T>` — so a builder whose vocabulary
cannot satisfy it fails to compile rather than throwing at resolve time. That is the trap
`diagnosticsAddon` fell into: `'transient'` satisfies `standard` and raises
`ScopeTagUnmatchedError` under `tagged`, with nothing at the call site saying so.

The constraint and a caller-supplied lifetime are different axes and a registering addon may want
both: the constraint says which vocabularies it works under, the parameter which value within one to
use.

The engine becomes a middleware. It stops being the terminus the fold wraps around — `build()` today
composes every installation's middleware around `address => engine.getService(address)` — and becomes
the innermost element of the same one list, composed exactly like anything else. There is then no
special last step, only a list.

`ServiceProvider` is the sole implementer of `IServiceProvider`, and `IServiceProviderInternal` is
dropped. That interface is the bare `getService(address): any` door, and it exists only so the engine
can be provider-shaped; a middleware is not, so nothing implements it once the engine moves. Its two
users take the plain function instead: `ServiceProvider`'s constructor loses its
`IServiceProviderInternal | Func<…>` union, and `askForControl` takes what it is really asking
through.

`ServiceProvider`'s constructor takes `Func<[Request], unknown>` and nothing else, and the rest of the
`Request` conversion proceeds from there.

The `Request` a `getService` call is running under is itself resolvable, and `IServiceProvider` stops
being a special case in the planner: the manifest is seeded with a factory
`(request: Request) => request.serviceProvider`, addressed as `IServiceProvider`. The provider
becomes an ordinary registration, and `visitServiceProvider` and its plan kind go.

The lifetime it is seeded under is `Control` — a symbol `di.core` declares and exports, not a string
(a tagged vocabulary is arbitrary strings, so `'control'` is a legal scope tag and would be
ambiguous) and not `Symbol.for` (its only advantage is surviving duplicate copies, which the
single-instance guard already makes impossible and loud). The slot type is `Lifetime | typeof
Control` — one engine-owned value declared once on `Registration`, not the unbounded erasure that
`Addon<any>` would be. The ENGINE answers a `Control`-lifetime registration itself, the way it
already answers a `Control<T>` address ask, so no model sees one, no vocabulary changes, and nothing
can cache it because `beforeConstruct` never fires. That retires `visitServiceProvider` and its plan
kind, replacing a hardcoded special case with a general one.

Per-ask is not transient. Transient is fresh per construction; this is one per ask, shared for the
whole lifecycle including latebounds. The model owns scopes, the engine owns asks, which is why it
does not belong in any model's vocabulary. Three consumers justify the mechanism: `IServiceProvider`,
`Request` itself, and `Diagnostics`, which already mints a per-ask compartment and had to fake a
lifetime to get registered.

- [ ] ~~Seeding it needs a lifetime in a vocabulary the seeder owns.~~ ANSWERED above. Every registration names one, and
      a cached provider is wrong, so the seed goes under `controlLifetime` — the engine's own value,
      not any model's vocabulary — and the ENGINE seeds it, unconditionally; no model is involved.
      A request is captured for the whole lifecycle of the `getService` that opened it, including any
      latebounds constructed under it — `captureForLaterCall` already snapshots the chain and the states for
      that reason, and the request joins them. So `resolveFrame` and `resolveLatebound` answer
      `request.serviceProvider` from the ask that minted the callable, and carrying it is also what stops a
      closure being re-pointed by whatever provider later invokes it.

- [ ] A resolvable `Request` is per-ask state that a cached service can capture — a singleton taking
      one holds a stale ask's type and attachments, and captivity validation will not catch it
      because transient into singleton is legal.

- [ ] Build it. Today `ContainerBuilder<Lifetime>` takes its parameter from `usingLifetimeModel`
      specifically, `Addon` is not generic, and `AddonInstallation.registrations` is
      `Iterable<Registration<any>>`.

## Validation options surface

- [ ] An options surface on the di builder that selectively installs the three validation
      middlewares. Owner-deferred when they were split (§217): `validateUniversalAddresses`,
      `validateBuildability` and `validateCaptivity` ship as ordinary addons that a composer
      `useAddon`s individually, with nothing scaffolded toward selecting a subset.

## Merge-strategy guards (2026-09-01)

- [ ] Find out whether mergesynth DETECTS overloads whose guards are provably indistinguishable, or
      silently order-dispatches. A collection's element type is never inspected: `Iterable` is a
      structurally satisfiable readonly view, so it is excluded from `nominalGlobals`
      (`mergesynthtransform/mergesynth.go:1075`) and floored by `objectKindCondition`, whose own
      comment names `Iterable<T>` as the reason it may not narrow past object-kind. So overloads
      differing only in element type — `Iterable<Foo>` against `Iterable<Bar>` — accept identical
      values, and dispatch falls to whichever is tried first. The flooring is deliberate and
      honest; whether the ambiguity is reported is the open part.

## The lifetime models are written again from scratch (2026-09-01)

Deleted in `libraries/di/src/lifetime/` — the three models and the machinery their shape depended on
(scope binding, root anchor, attributing hooks). Owner-ruled: written clean-room, by a context that
has never read the deleted source, because that source is shaped by the very machinery §230 removes
and a reader reproduces it by gravity.

Two conditions on the brief:

- The CODE is off-limits, the CONTRACT is not. `tests/di.test`'s model suites travel with the brief
  as behaviour without structure. 22 of 30 files there do not load with the models absent.
- THE REFERENCE OUTRANKS THE TESTS. Every test for `standard` must be a reflection of the reference
  lifetime model. Where a test asserts something the reference does not do, the TEST is over-spec —
  challenge it and cut it, do not satisfy it. Reproducing our own inventions is exactly what the
  clean-room is meant to stop, and a test suite is as capable of carrying them forward as the source
  was. Known instance: `validateScopes` defaults ON here where the reference defaults it OFF.
- The reference is therefore the oracle, never the deleted port. Its own structure is nothing like
  this engine's, so consulting it cannot contaminate the shape.

Validations are not part of the model. They are additional middleware layers, separate from it —
but authored WITHIN the addon's black box, by whoever writes the model, not supplied by the engine
and not a shared generic validator. §217 already records the three as independently installable,
each throwing over only its own failure kind; this says who authors them and where they sit.

There is no `noop` model in the replacement set. Installing a model is optional outright, so a
container with none installed already IS that case; a model that does nothing was only ever
standing in for the absence of one.

Sequencing: after the builder reshape, not alongside — the models are built against the new door.

## Node-vocabulary collapse — review findings (2026-09-01)

Found by adversarial review of `2b7542e6`, which is committed and gate-green. None of these were in
the implementer's behaviour-change list.

- [ ] `schemaoftransform/expand.go:229` — a member typed as a NAMED callable alias
      (`type Handler = (x: string) => number`) now hard-errors `992001 unsupported type` where it
      derived as `Type.imported("Handler", …)`. The construct/call gates moved ahead of the second
      name read. Violates the stated invariant: `Handler` IS expressible, so the refusal is "the
      walk could not do it" wearing a grammar limit. Same class for a `typeof SomeClass` member.
- [ ] `tokens/node.go:325-329` — `deriveObjectNode` silently drops symbol-keyed members and still
      answers `true`, so `IThing & { [KEY]?: string }` derives `Type.intersection(…, Type.object({}))`
      and any two such brands over one base collapse onto the same node. The old walk refused. Refuse
      when a property set is non-empty in the checker and empty after filtering.
- [ ] `tokens/node.go:331-333` — an optional property whose type is a union ALIAS loses its identity:
      `{ a?: Level }` derives `union(lit a, lit b, lit undefined)` rather than `named(Level)`, because
      the checker's `Level | undefined` carries no alias. `Type.isOptional` still answers, but
      `Type.isMatch(Level, …)` no longer does. May be unavoidable; decide and say so either way.
- [ ] `tokens/generics.go:64-70` — `DeriveTokenF` strings are NOT byte-identical as claimed: a named
      callable alias went from its name to a refusal, and a literal-union alias from its members to
      its name. Latent — `TokenForType`/`TokenForReturnType`/`ServiceBaseTokenFor`/`KeyedTokenFor`
      have no callers outside `internal/tokens` — but they are the package's exported surface.
- [ ] `tokens/node_test.go:22` — `TestDeriveTokenFMatchesRendererOverDeriveNode` asserts an
      expression equals itself now that `DeriveTokenF`'s whole body is `renderNode(DeriveNode(…))`.
      It would pass with every kind deleted.
- [ ] `tokens/node.go:156-158` — a new refusal for an `Inject`-pinned keyed base, with no test and no
      counterpart in the old walk, so `typefor<Keyed<Inject<T,"tok">,"k">>()` went from lowering to a
      diagnostic. `Type.tag(Type.global(tok), key)` is spellable, so the justification is arguable.
- [ ] `typeforhoist/hoist.go:203-211` — the intersection key joins with `" & "` unparenthesized in the
      same flat namespace as the union's `" | "`, and `Registry.Ref` matches on the string alone, so
      `Union([Inter([A,B]), C])` and `Inter([A, Union([B,C])])` both key `"A & B | C"`. Unreachable
      today because TS distributes, but the union key was unambiguous before this kind existed. Wrap
      it as `Tuple` and `Object` wrap theirs.
- [ ] `typeemit/typeemit.go:198-206`, `typeforhoist/hoist.go:511-521`,
      `schemaoftransform/expand.go:317-320` — three independent copies of the object-key spelling
      rule, each with its own identifier regexp. Hoisted-to-inline byte parity now depends on all
      three staying identical.
- [ ] `tokens/node.go:400-414` — `withUndefined` treats a `null` member as satisfying optionality, but
      `Type.isOptional` (Type.ts:417) accepts only `typeLiteral(undefined)`. Unreachable under strict;
      still the wrong predicate.
- [ ] `tokens/node.go:290` — `deriveTupleNode` reads `ctx.Checker` where every sibling uses the passed
      `checker`. Cosmetic today; the parameter exists so it can differ.

## Transformer vocabulary collapse (2026-09-01)

Design recorded as §232.

- [ ] Re-run `tests/di.test` once the transformer builds again — it resolves through `ttsc`, so it
      cannot pass while the Go tree is half-migrated. Last clean run 292 pass / 6 skip / 0 fail; the
      only changes since are `di.core`'s hook-chain walk moving onto `ImmutableLinkedList`, which
      typechecks and lints clean.
- [ ] Run the repo-wide `bun run lint` once nothing else is building — only the touched packages have
      been linted, because concurrent build and lint here produces phantom type errors.
- [ ] Consume the collapse workflow's review findings and decide what to fix.

## Structural synthesis (2026-09-01)

Design recorded as §231.

- [ ] `typefor` cannot derive a structural or tuple type — HELD pending the tuple work landing.
- [ ] Derivation must spell an optional property as a union with `undefined` — `ObjectType.members`
      carries no optional flag, and `Type.isOptional` already defines optional as exactly that union,
      so the union's literal fallback is what keeps a missing optional from failing the whole shape.
- [ ] DELETE the "Parked: awaits its design ruling" comments on `visitCtor` and
      `visitAbstractCtor` — there is nothing to rule, so they promise work that is not coming. Add
      nothing in their place: every kind that synthesizes nothing just returns `undefined`, which
      the class doc already accounts for. `visitTag` needs no comment either.

## Moved out of the decision log (2026-09-01)

- [x] Probe whether a bare `typefor<T>()` derives correctly inside a SUBSTITUTED body — confirmed
      correct by a real `ttsc` build (§233); the `tokenfor`/`tokenof`/`nameoftransform` trio is retired.

## Resolution door — design taken this session (2026-09-01)

Settled in conversation, to be written up as a decision entry; listed here only so nothing is lost
if that write-up slips.

- [ ] `Request` splits into `ServiceRequest | ControlRequest`. Named types, so a named address
      resolves nominally and structural synthesis cannot manufacture the arm that is absent.
- [ ] The live ask enters the registration graph in exactly ONE place — its own type. Every control
      service becomes an ordinary registration that declares a `ServiceRequest` slot and derives
      from it. The engine's control branch goes, and with it the volatile door.
- [ ] `IServiceProvider` is a permanent factory registration under `controlLifetime`, its slot
      addressed `ServiceRequest`. During the fold nothing answers that slot, so it is unsatisfiable
      through the ordinary absence path with no check written anywhere.
- [ ] `Request` and every arm of the union are resolvable addresses in their own right. Asking for
      `Request` answers whichever arm the live ask is; asking for `ServiceRequest` answers only when
      that is what the ask is, and refuses otherwise. A control service declares the arm it needs
      and inherits the refusal for free.
- [ ] The live ask is registered in the overlay under its NARROW type — `ServiceRequest` for an ask
      a provider opened, `ControlRequest` for one the fold makes. There is no discriminant check
      anywhere: whoever mints the request picks the address, which is the only place that knows.
      An ask for `ServiceRequest` under a `ControlRequest` finds nothing and refuses through the
      ordinary absence path.
      VERIFIED, and it rules out resolving the union structurally: an EXPORTED alias derives as a
      NAME, not a union — `TestDeriveNodeExportedAliasUnionNames` against
      `TestDeriveNodeLocalAliasUnionDecomposes` in `transforms/internal/tokens/derived_test.go`,
      where only the non-exported alias decomposes. `Request` must be exported, so `typefor<Request>()`
      is `Type.imported("Request", ...)`, a name resolves nominally with no fallback, and an ask for
      it would refuse. The overlay therefore registers the ask under BOTH addresses — the narrow arm
      and the union name — one object, two value registrations. FOR NOW: owner-ruled as the way
      forward, not as the settled answer. The thing underneath it is general — no exported union
      alias can ever be answered by a registration against one of its arms — and the eventual fix
      is assignability, which the owner intends to tackle one day. It subsumes this case: an arm is
      assignable to the union, so the narrow registration answers the wide ask on its own and the
      second registration goes. The direction is the whole point and is easy to get backwards — a
      NARROWER registration may answer a WIDER ask, never the reverse.
- [ ] Consequence to get right: the overlay's ADDRESSES must be visible to the PLANNER while its
      VALUES arrive per ask. A plan is memoized per `Registry` object (`Plan.ts:250-252`), so an
      overlay folded into a fresh registry per ask kills the plan cache outright — but an overlay
      invisible at plan time makes `ServiceRequest` unplannable and every control service refuses
      before it starts. The declaration belongs in the registry the engine plans against; only the
      answer comes from the ask.
- [ ] `controlLifetime` stops bypassing planning. Today `Engine.#resolveControlLifetime` calls the
      factory with the raw request and no plan; it must plan the factory's slots like any other
      registration, keeping only the no-caching property.
- [x] §208, §209 and §220 are out of the decision log; every cross-reference is corrected in place.

## Resolution door — open, awaiting the owner (2026-09-01)

- [ ] RULED: `Type` is NOT a resolvable address. The `Request` is the resolvable thing and it
      carries the requested type; a factory that wants the current ask's address takes the request.
- [ ] RULED: an addon MAY contribute per-ask registrations of its own. Constraint the implementation
      must respect: `Plan.from` memoizes per `Registry` object (`Plan.ts:250-252`), so a per-ask
      registry must not rebuild every plan on every ask — addresses stay fixed at build and only
      values vary.
- [ ] RULED: accept the weaker diagnostic. An unanswerable control ask becomes a generic
      `UnsatisfiableError` once control services are ordinary registrations; `UnknownControlError`
      goes rather than being recovered at the refusal path.
- [ ] §224 (the keeper caches the make's product) and §226 (the instance cache keys as-registered)
      are true only of the models we happen to know, so they are blackbox detail standing as general
      rulings — which the black-box ruling itself forbids. Sealed from the clean-room writers either
      way. Open: drop them, or re-scope each to "the standard model's own choice" the way the tandem
      pair is already scoped. §225 and §229 are boundary rulings, read as contract, and stay.

## Builder reshape — aftermath (2026-09-01)

- [x] `CaptiveDependencyError` is out of di.core's taxonomy: captivity is the model's own, never
      shared between models, so a shared captivity error type has no owner.

- [ ] No static `withServices` opener exists, though the spec says services or the model may come
      first. `hosting` and `logging` each hand-rolled `const noLifetimeModel: Addon<unknown>` to open
      a chain — the noop model, reintroduced in product code, twice.
- [ ] The engine is not really an element of one list: its middleware ignores `next` and the fold
      seeds a throwing terminus that is dead by construction (`di.ts`, `build()`).
- [ ] Nothing registers anything under `controlLifetime`. The mechanism is built and unused.
- [x] RULED: deleted. `LifetimeArgument` and `LifetimeModelError` stay; a model is an `Addon`
      installed through `useAddon`.
- [ ] RULED 2026-09-01: build the builder AS SPEC'D in "Builder shape — owner-prescribed" —
      `useAddon(Addon<T>)` and `withServices(fn: Func<[Manifest<T>], Iterable<Registration<T>>>)`
      are the members, no `use` verb, no registration-iterable or middleware overloads, no
      augmentations. The interface is `Builder`; the non-exported implementation is
      `DefaultContext`; the opener is a function in `namespace Builder`, not a static method.
      `di.usingLifetimeModel` is not restored — a model is an addon and goes through `useAddon`.
      Lock-on semantics, stated by the owner: a chain may open with addons whose `T` is still
      `unknown`; the first addon carrying a concrete vocabulary SWITCHES the builder to it, and
      from then on every addon must thread that `T`. That is why `Addon<T>` is generic even where
      an addon does not use `T` — it threads the vocabulary through. Direct consequence to land
      with it: the engine becomes a real middleware that calls `next` when it cannot answer, so
      the chain's terminus is live rather than dead by construction.
- [ ] `logging/README.md` still demonstrates `di.usingLifetimeModel(standardLifetimeAddon())`; it
      cannot be adapted honestly until a lifetime model exists.
- [x] The builder-shape section's tail now says the ENGINE seeds `IServiceProvider` under
      `controlLifetime`, unconditionally. The single-door law spelled `IServiceProvider.getService(Type)`
      is NOT stale: it is the owner's verbatim ruling and names the public interface's
      signature, which §230 keeps — only the chain and engine take a `Request`.
- [ ] Two unbounded, never-evicting caches keyed on runtime input, both plain objects holding strong
      references: `Type/factory/intern.ts:24` (`table`, keyed on a structural string) and
      `Type/Type.ts:215` (`parsed`, keyed on the raw token string). `Type.from` is the door data
      arriving from outside comes through, so the second one grows with program INPUT, not with
      source vocabulary. Decide whether that needs a bound.

Side-by-side audit otherwise CLEAN: no process-global mutable state in di, di.core, di.extras,
primitives, primitives.extras or any external dependency lets two containers observe each other.
Two independent containers are fine; two loaded COPIES of primitives or di.core are impossible by
design, and fail loud.

## Signatures as a Type node (2026-09-01) — LANDED `d95a316c` + `3c256815`, REPAIRED `5782bf5b`..`ab022ae2`

`Type[][]` is the one place a node's children are host arrays rather than nodes, which is what
`adoptSignatures` and `signaturesKey` exist for. Making a signature list a node retires both, drops
the ctor/func intern key to two ids, and satisfies the one-kind-per-member rule.

- [x] Give a tuple a way to express open length — an optional or rest slot. Today both are refused
      (`tokens/node_test.go:164`) on the stated grounds that "a list of slots can only state a fixed
      one, so derivation fails rather than reporting an arity the type does not have". That single
      addition closes two refusals: variable-length tuples become derivable, and a signature
      inherits variadic instead of needing a variadic slot of its own.
- [x] Then a signature list becomes a node, held in ONE slot rather than a host array of host
      arrays. The slot is typed by the widest shape it can hold, which is the convention the factories
      already run on: a factory that can collapse answers the wide type (`union`, `intersection`
      answer `Type`) while one that cannot answers its own (`tuple`, `array`, `imported`). `global`
      is the closer precedent — it collapses to a `ListType` and enumerates its two outcomes rather
      than widening all the way — so the slot reads `TupleType | UnionType`: a tuple for one
      signature, a union for several. It makes no promise about the union's members being tuples;
      that is the construction check's job, replacing `adoptSignatures`' existing one. Reads go
      through a single normalizing accessor answering `readonly TupleType[]`, so the one-or-many
      branch lives in one place instead of in every visitor.
      A third form supporting both spellings is NOT viable — two spellings of one type would intern to two nodes
      and `===` is the equality operator for the whole subsystem.
- [x] Order among signatures: ADD NO ORDERING RULE. `compareTypes`/`canonicalMembers` must not gain
      a length-first or signature-aware rule. Selection already happens at the point of use and the
      stored order is already the right tiebreak: the LONGEST SATISFIABLE signature wins
      (`Plan.ts`'s `lowerSignature` sorts longest-first and takes the first whose every arg lowers),
      and equal-length satisfiable ones fall to the union's canonical order because `toSorted` is
      stable. The single obligation: the normalizing accessor must return a union's members AS
      STORED — grouping, deduping or rebuilding them silently changes which of two equal-length
      overloads wins, and no existing test would catch it.
- [x] Optionality is NOT a tuple field. `Type.isOptional` already defines optional once for the
      whole model as "admits `undefined`", objects spell an optional property as a union carrying
      the `undefined` literal, and optional parameters already derive that way. A tuple obeys the
      same rule, so the tuple gains a REST slot and nothing else — no `optionalCount`, no
      `TupleOptionalCount`, and no fabricating overloads for optional parameters.
- [x] A signature that is entirely a rest parameter is a `ListType`, not a one-member tuple holding
      an array: the row IS the argument list. That is what fixes the live miscall where
      `(...deps: IDep[])` receives `[theArray]` as its first argument.
- [ ] OWNER-RULED: equal-length signatures that are both resolvable have nothing to choose between
      them — the author wrote something ambiguous, and no container can read their mind. The
      canonical order picks, and that is DOCUMENTED as the behaviour rather than papered over. The
      tiebreak therefore has to be deterministic, not meaningful, so no specificity comparison is
      owed. Document it as "the canonical order picks" — and that order IS
      TypeScript's, so it can be documented as such: `canonicalMembers` adopts TS7's `CompareTypes`
      shape translated to this vocabulary, diverging only by dropping declaration-order and id
      residue, which TypeScript itself is moving away from.
- [ ] Open, if signatures land in a `UnionType`: a one-signature callable's union collapses to the
      bare tuple, so the field's shape varies with overload count. Either consumers read "tuple or
      union of tuples", or a non-canonical one-member union needs a constructor — and then an answer
      for why that constructor cannot be reached for ordinary addresses, since two ways to build one
      kind is where interning identity fragments.
- [ ] Consequence either way: this changes the `Type` union, so the Go node vocabulary must follow
      and every visitor gains the case. A `Type`-model change, not a transformer patch, and
      independent of the resolution-door work.

## Moved out of the decision log — second sweep (2026-09-01)

- [ ] Certify the static / namespace / const-member and class-member (shape-1-without-`impl`)
      matchers. Grammar-valid today, matchers uncertified. Nested member paths (`A.B.fn`) are
      describable by the grammar and deliberately unimplemented — that half is a decision, not work.
- [ ] The authoring sugar the value door was meant to pair with is HELD, waiting on a settled
      spelling for its inline body. Unblock or drop it.

## Door and signatures — captured 2026-09-01

- [ ] The engine calls `next` when it cannot answer, rather than owning the refusal: user
      extensibility may legitimately compose BELOW the engine, so it is not the last word and the
      terminus is the genuine "nobody answered" point. This obliges a distinction the engine does not
      make today — "no registration for this address" is delegable, "a registration exists and its
      dependencies cannot be met" is an error that must NOT fall through to a user's fallback and
      read as a miss. `Plan.from` raises `UnsatisfiableError` for both today.
- [ ] The seeded `IServiceProvider` factory lives in the MAIN MANIFEST, not the overlay; only the
      live ask itself is per-request. Consequence recorded rather than decided: a resolvability
      validator, if one is ever built, either knows the provider is manifest-side or works against
      the overlay.
- [ ] The tooling description belongs as a SECTION INSIDE the requirements doc — the APIs a model
      must build on — not as a document of its own. Write it after the door lands, since that is the
      surface it describes.
- [ ] RULED: leave symbol-keyed derivation exclusion as it is until there is a reason to change it.
      A key does not have to be a symbol to be excluded from an interface, so the exclusion is not
      what keeps `Request`'s `[key: symbol]: unknown` member off the address — the two are unrelated.

### Ruled 2026-09-01

- [ ] The ENGINE bypasses hooks for a `controlLifetime` registration. A model never sees one and
      never has to know the sentinel exists. Cost accepted: an audit or diagnostics addon cannot
      observe control resolutions either.
- [ ] `LifetimeArgument<Lifetime>` and `LifetimeModelError` both STAY. "Remove all Lifetime related
      interfaces" reaches `LifetimeModel` itself, not the vararg helper a registering addon uses nor
      the error.
- [ ] A tuple with an optional or rest element must DERIVE, not refuse — "support it if you can".
      That is the open-length tuple work above, and it settles the array-typed rest parameter too:
      the answer is to state the shape honestly, never to approximate it. Widening `[IA, ...IB[]]`
      to `Array<IA | IB>` loses that the first element is required and is `IA`; spelling
      `[IA, IB?]` as a two-member tuple claims an arity the type does not have. Both are the silent
      approximation §232 forbids. The first-pass coverage commit's array-rest test, which pins the
      current misstatement as deliberate, gets rewritten when this lands.

### Awaiting the owner's word

- [ ] Should the engine BYPASS hooks for a `controlLifetime` registration, or should each model skip
      it inside its own black box? Recommended: the engine bypasses — the alternative puts the same
      skip in every model and forces every model to import `controlLifetime` to recognise what it is
      skipping, a concept the model is meant to sit outside of. Cost: an audit or diagnostics addon
      cannot observe control resolutions either.
- [ ] Does "remove all Lifetime related interfaces" reach `LifetimeArgument<Lifetime>` and
      `LifetimeModelError`? `LifetimeModel` is unambiguous. `LifetimeArgument` is the vararg helper an
      addon uses to take a lifetime from its caller and says nothing about how a model works, so it
      `LifetimeModelError` is a shared error ABOUT models — a shared type with no single owner,
      the shape a model-owned concern never takes.
- [ ] An array-typed rest parameter (`...deps: IDep[]`) derives as ONE required `Array<IDep>` slot
      where a tuple-typed rest refuses loudly — a silent arity misstatement, the class §232 forbids.
      Refuse it too, or let the open-length tuple work express it honestly?

## di — proposed execution order (2026-09-01)

The order to work in, one line each. Sections above carry the substance; this is the sequence.

1. ~~Signature slot becomes one `Type` node, open-length tuples and the Go mirror as fallout.~~ DONE — `d95a316c` (the change) + `3c256815` (review repairs). A list row spreads at the call, a required-prefix-plus-rest derives as an open tuple, optionality stayed a union with `undefined`, and `compareTypes` gained no ordering rule.
2. Resume the blind typefor shape suite once the Go toolchain frees up.
3. Add the static `withServices` opener so nothing hand-rolls a vacuous addon to start a chain.
4. Engine calls `next` when it cannot answer; split "no registration" (delegable) from "unbuildable registration" (error).
5. Split `Request` into `ServiceRequest | ControlRequest` — types only.
6. Register the live ask under both its narrow arm and the union name.
7. Seed `IServiceProvider` as a permanent factory in the main manifest under `controlLifetime`.
8. `controlLifetime` plans its factory's slots instead of bypassing planning; the engine skips hooks for it.
9. Retire the control branch; `getService`'s switch goes; §208, §209 and §220 come out of the log.
10. DONE. Delete `LifetimeModel`; keep `LifetimeArgument` and `LifetimeModelError`.
11. RULED: build as spec'd — `useAddon`/`withServices`; `Builder` interface, `DefaultContext` class, `namespace Builder` opener; unknown-until-locked vocabulary; engine becomes a real middleware. NEXT, with 3 and 4.
12. Delete `CaptiveDependencyError` — a shared captivity type nothing throws.
13. DONE. "The MODEL seeds this" corrected; the single-door wording was the public signature, not stale.
14. Owner hand-rolls the model requirements doc, including its APIs-to-build-on section.
15. Write the standard model clean-room against the finished door.
16. Un-comment the dependers and re-green the 22 `di.test` files.
17. Write the tagged model.
18. Scope and container disposal.
19. Whether an addon may install into an already-built container — if not, half of `HookChain` deletes.
20. A latebound closure invoked after its minting scope is disposed.
21. Whether `anchorRoot` and `ScopeBinding`'s bracketing still have a job.
22. The validation options surface.

Ruled 2026-09-01, so nothing gates 5-7 any more: `Type` is not a resolvable address (the `Request`
is, and carries the type); an addon may contribute per-ask registrations; the symbol-key derivation
exclusion stays as it is, unrelated to the request design; and the per-ask `Request` allocation is
accepted as an additional object on the ~400ns path. Nothing blocks 5-9 on the owner.

### Why this order — the constraints, so a different one can be derived

The sequence above is one solution to these edges. Re-order freely within them; violating one is
what costs rework.

HARD, and each for a stated reason:

- **1 before 2** — only because this machine cannot run concurrent Go compiles. Not a logical
  dependency; whichever holds the toolchain blocks the other.
- **5 -> 6 -> 7 -> 8 -> 9** — a real chain. 5 creates the arms; 6 makes them answerable; 7 seeds the
  first consumer that declares an arm; 8 makes 7 plannable rather than special-cased; 9 removes the
  branch 7 replaced, and cannot precede it without leaving nothing to answer control asks.
- **9 before 10-13** — each is a question 9 settles rather than one to decide beforehand.
- **9 before 14** — the requirements doc's APIs section describes the post-door surface, so writing
  it earlier documents a shape with a known expiry.
- **14 before 15** — the model is written against the requirements, and by an author who has read
  nothing else.
- **15 before 16** — 22 `di.test` files cannot load without a model, so nothing re-greens until one
  exists.
- **15 before 18-22** — all five are model-owned questions and cannot be answered against no model.

SOFT:

- **3 and 4** depend on nothing and gate nothing. They are early because they repair what already
  landed and are cheap, not because anything waits on them. 4 makes 9's story cleaner but is not
  required by it.
- **17 after 15** by preference only: the standard model proves the tools the tagged model reuses.
  Nothing structural forbids the reverse.
- **13** is docs-only and can land at any point.

FREE: 2, 3, 4, 12 and 13 can be placed anywhere consistent with the above.

## Left by the signatures work (2026-09-01)

- [ ] `typeforhoist.Union`'s doc comment calls itself a "literal-union node" though it has long held
      general members. Pre-existing, surfaced by this pass.

## Signatures slot — adversarial pass findings (2026-09-01)

Eleven findings survived two-refuter votes; a Fable repair run landed them as `5782bf5b` (every
signatures door runs the one row check; a rest-only tuple is refused — the refusal since reversed
to the collapse recorded below), `ec8c175b` (a malformed row
never plans as a spread; a zero-arg rest call hits the plan memo), `fe948cb0` (the Go derivation
emits the list for a rest-only tuple) and `ab022ae2` (open-row emission parity, four more blind
shapes). Gates after: Go build/vet/test/gofmt clean, tsc clean in primitives, primitives.extras, di,
di.core; primitives 217/0; typefor e2e 60/0; di.test 94 pass / 6 skip / 22 fail with the load-failing
set unchanged. Two were real defects, and both are failures of a rule this design stated rather
than incidental bugs.

Left open by the repair's own review (its finish stage died on the 5-hour quota):

- [x] `Plan.restList` narrows a row to list-or-tuple and throws on anything else — a second spelling
      of the row predicate, in a package that cannot import the one function. RULED (Claude, the
      owner may reverse): keep the narrowing, since a plain-object `ctorType` never passes a
      primitives door and exhaustive narrowing is owed anyway, but its message must say the row
      reached planning unvalidated rather than restate the door's wording.
- [x] `node.go`'s rest-only-tuple branch is unwitnessed and unreachable: the checker normalises
      every rest-only spelling (`[...B[]]`, `[...Array<B>]`, `Parameters` of a rest-only function,
      a `[...T]` spread instantiated with a list) to the array before derivation. The branch is
      deleted; a `node_test.go` case pins that the rest-only source spelling derives the Array
      node.

- [x] **The one validating door has a second entrance.** The spec put the check in
      `Type.signatures(rows)` alone, so `func`/`ctor`/`abstractCtor` could take the slot type and
      validate nothing. But their PRE-BUILT-SLOT overloads, `toSignatureSlot`'s non-array branch and
      `Type.adopt` all accept a union of non-row members, so an invalid callable interns, stringifies
      to a form the parser cannot read, and `Plan.ts`'s rest handling would spread it. The lesson
      generalises: an overload that accepts an already-built value is a way past whatever door built
      it, and "validate once, let the type carry the guarantee" only holds if the type is the ONLY
      way in.
- [x] **Two spellings for one type.** `Type.tuple({ members: [], rest: X })` used as a row and a
      `ListType` row stringify identically, so the round-trip would conflate two distinct nodes.
      RULED (owner): collapse — the rest-only tuple IS the list, so every entrance answers
      `Type.array(X)` (the factory, `Type.adopt`, and the parser, where `[...Array<X>]` reads as
      the list's own node). The one boundary: the collapse fires only when members is empty AND a
      rest is present; `{ members: [], rest: undefined }` is the legitimate empty tuple — a
      zero-argument signature's row — and stays a `TupleType`. `Type.tuple` accordingly answers
      `TupleType | ListType`, and callers narrow at the call site.
- [x] A zero-argument memo miss in `Engine.boundArgTypes` — the interning-for-identity rework did not
      cover the empty-signature case.
- [x] Two doc inaccuracies, a history-narrating comment in `typeforhoist`, and four shapes the blind
      suite does not cover.

## Review protocol and phases — owner-set 2026-09-02

Every lane flows through the owner's serial review: a lane is SQUASH-MERGED into
`IServiceManifest-repair` locally and left UNCOMMITTED (staged) so the owner reviews the diff in the
working tree before it becomes a commit. Lanes may start in worktrees as soon as they are unblocked;
later lanes branch from the previous lane's tip so they stack, and rebase once the owner commits.

- Phase 1: steps 9, 10 and 11 (10 in `+feat-di-delete-lifetime-model`, 11 in `+feat-di-builder-spec`,
  9 next, stacked on 11). The recorded edge "9 after 7" is OVERRIDDEN by the owner for this queue:
  the engine is not run at any point in it, so the old control branch is cleared out first and the
  new door written in afterwards — nothing has to keep answering control asks in between.
- Phase 2: the `Request` type in full — steps 5, 6, 7, 8.
- Also queued on the builder branch before its review: `Type.from` string-only with the parser
  parsing literally into the adopt visitor (ruled above).

Owner notes on the later steps: 19's answer is already in effect (the model implementations are
deleted; the standard model is written clean-room).

### Hooks — ruled 2026-09-02, for phase 2 (supersedes the phase 2 design run `wf_fe44239a`, which must be revised before implementation)

- The requirement for behaviour-modifying hooks: they execute ONLY for asks that flowed through
  their middleware. Parallel scopes are a fork in the chain — two live layers over one base chain —
  and an ask through one must never run the other's. Only the ask itself knows which layers it
  traversed, so activation is a property of the `Request`.
- ONE mechanism. A middleware installs its hooks ONCE, in its outer (install-time) call, through the
  engine's hooks control, which it reaches through the door like any control. The engine holds every
  installed bundle; installing and uninstalling are COLD (each rebuilds the engine's precomputed
  per-kind dispatch once); nothing on the ask path installs, splices or checks for removal. Two
  control verbs, one entry shape underneath:
  - `useHooks(hooks: Partial<Behavior>): Handle` — GATED: in effect only for an ask that activated
    the handle. The layer's per-ask function is `request => next(request.activate(handle))`.
  - `installHooks(hooks: Partial<Behavior>): Handle` — ALWAYS ACTIVE: an installer middleware
    (audit, diagnostics) adds its hooks and its per-ask function is `next` itself. Its effects are
    global and forever by definition. (`installHooks` is Claude's name; the owner may rename.)
- Activation: `request.activate(handle): this` MUTATES the request and returns it — the request
  records which handles are active; callers write `next(request.activate(handle))` as if it were a
  new value. Alloc-free gate: a handle is an index, a check is one comparison. The engine dispatches
  the always-active set first (outermost, precomputed once per install) and then the request's
  activated handles in activation order; trailing-`next` hooks nest in that order. DISPATCH WALKS
  ONLY WHAT IS ACTIVE, never the whole installed list — so entries that are dead cost nothing per ask
  and a scope-per-request process does not slow with uptime.
- Why the request and not an engine-side window: a latebound is CREATED inside a resolve, while a
  window is open, and INVOKED later, when none is; what it captured at creation — the request — is
  all it has, so the request must be what remembers the active handles. `using _ = handle.activate()`
  was considered and dropped for exactly that. The engine is synchronous, so a window would have been
  ask-scoped; that was never the problem.
- The middleware chain NEVER seals: layers may be added at any time (a scope factory wraps a new
  layer over the folded chain), and hooks may be installed at any time. A scope factory installs its
  model's hooks once per behaviour where it can; installing per scope opening is permitted — the
  installed list only grows, and thousands of dead entries are kilobytes.
- Orphaned middleware: never activates again; its entries cost memory only. Uninstall EXISTS
  (`handle.uninstall()` or the control's verb) for long-lived containers, kept off the hot path. A
  handle a captured request still names after uninstall simply fails its gate. Best-effort
  reclamation is permitted through a `FinalizationRegistry` registered on the PER-ASK HANDLER the
  chain holds (that is what orphaning drops), holding only the handle id (never the handler or the
  bundle); it is non-deterministic and may never run, which is acceptable only because uninstall is
  semantics-neutral. It lives in the addon that opens scopes, not the engine.
- Allocation: the behaviour is a CLASS instantiated once per install (hook bodies on the prototype,
  closed-over state in `#` fields); handler-vs-trailing-`next` arity is read once at install, never at
  dispatch; per-ask hook state lives in the engine's per-ask states array sized from the active count;
  per-scope data rides the request (§230); the dispatch loop allocates nothing.
- Hooks are di.core's own vocabulary, so `activate`, the active set, and the control's verbs are NAMED
  members, not symbol-keyed; the symbol rule keeps ADDON vocabulary off the core type.
- Performance: the win is per-node — always-active hooks and arity are precomputed per install rather
  than per ask, so the realize loop skips hook kinds nobody implements; a few percent of an ask on a
  small graph, more on deep ones, visible only on the benchmark. The tier exists for its semantics;
  the speed is a consequence.
- Gone: the disposable window (§209), `withHooks`, install/uninstall on the ask path, and any
  engine-side "which hooks are in effect" state other than the installed list and its gates.

## Session — di builder reshape (2026-09-01, branch `feat-di-builder-spec`, worktree `+feat-di-builder-spec`)

Steps 3, 4 and 11 of the execution order, built as one change from a critiqued design. The branch
is rebased onto `ab022ae2`, the repair tip: the registered predicate moved onto `Registry` (one
place; `Plan.from`, the engine, and `PlannerVisitor.#awaitPromised` call it); `UnknownControlError`
deleted; the engine delegates through `next` when no registration matches and throws when one
exists but cannot be built; `Builder` interface with the unknown-until-locked conditional verbs,
`DefaultContext`, both openers in `namespace Builder`, the engine folded as a real middleware over
a terminus that throws `UnsatisfiableError`; callers migrated (logging, hosting, the ten example
demos, the di, logging, and four downstream README snippets); §208 corrected in place; new tests
(engine delegation, chain openers, the lock-on type probe repointed at the shipped surface). Gates
on the branch: tsc clean in di.core, di, hosting, logging, both example apps; eslint clean; di.test
105 pass / 6 skip / 22 fail with the load-failing set unchanged; dprint clean.

Shipped cast inventory (differs from the critiqued design's disclosed shape, deliberately): one
in-cast per `DefaultContext` verb, zero out-casts, and no cast in `build()` — the removals only
strengthen checking. The lock-on type probe (`builder-lock-on.types.test.ts`) is exercised by no
green gate until the lifetime-model deletion lane lets di.test's lint run again; until then a
change to `Builder`'s signatures needs a manual isolated tsc pass over that file.

- [x] Craft review's three findings, applied: `1d74e22b` removed both `as never` out-casts in
      `DefaultContext`'s verbs, `08e785e1` pointed `PlannerVisitor.#awaitPromised` at the
      registry's one registered predicate, `f1f0efb1` dropped `build()`'s no-op cast.
- [x] The spec-fidelity and correctness review lenses ran; repair applied (the di and logging
      README front doors moved to the shipped `Builder` surface, §208's beneath-the-engine
      sentence corrected to the terminus-only shape). One finding rejected as an unruled design
      change: no addon position exists beneath the engine, and adding one is the owner's call.
- [ ] Merge locally into `IServiceManifest-repair` — only when the branch is green AND the shared
      branch is clean.
- [ ] Known and NOT this branch's: the without-transformer example app wedges at baseline after
      "Hosting started" (reproduced at `6732b734` with pre-branch sources), so its output-diff gate
      cannot run; owned by the hosting rework / red-by-design surface.

## Ideas (2026-09-02) — not ruled, not scheduled

### Registration carries no lifetime; addons demand per-registration data

`Registration` reduces to address plus implementer. Lifetime stops being the privileged extra and
becomes one addon's demand among others (tags, keys, diagnostics labels, validation metadata). The
black box becomes structural: the core type carries no addon vocabulary and an addon attaches what
it needs — the same move `Request` already makes (§230), one level down. Control registrations then
need no sentinel at all, because there is no slot to fill.

A mechanism has to answer two halves: how an addon DECLARES a demand ("every registration filed
while I am installed must carry X", with X's type), and how that demand is ENFORCED at authoring
time. Where it bites: order (services filed before the demanding addon cannot satisfy it
retroactively — the lock-on's existing dynamic, to be decided deliberately); type plumbing (addons
contributing slots); the sugar layer (`add<T>()` must see the demands to lower to the explicit form).
Runtime cost is nothing — the data lives on the frozen registration object where `lifetime` lives
today. The owner has a solution in mind for every part except the `RegistrationBuilder`.

The builder, in the abstract, is a slot machine and only its slot list changes. Today the slots are
a literal union with one special case (registration-ness withheld while `lifetime` is unspent and
`undefined` is not in the vocabulary). Generalised, the slot list is `'implementer' | keyof Demands`
and the special case is the general rule: a demand is REQUIRED exactly when its type excludes
`undefined`, and the node withholds registration-ness while any required demand is unspent.

```ts
type Required<D> = { [K in keyof D]: undefined extends D[K] ? never : K; }[keyof D];

type RegistrationBuilder<T, D, Spent extends keyof D, Described> =
  & (Required<D> extends Spent ? Described : unknown)
  & ('implementer' extends Spent ? unknown : IAsImplementer<T, D, Spent>)
  & { with<K extends Exclude<keyof D, Spent>>(key: K, value: D[K]): RegistrationBuilder<T, D, Spent | K, Described>; };
```

- One generic verb, many fluent names: `with('lifetime', v)` is the primitive; `withLifetime(v)` and
  `taggedAs(k)` are augmentations that call it, shipped the way `Manifest` verbs already are. The
  builder never learns a demand's name.
- The map is the vocabulary: whatever threads `Lifetime` through `Addon`, `Builder`, `Manifest` and
  the lock-on threads `Demands` instead; lock-on becomes intersection (two addons' demands merge into
  one map); withholding, lock-on and "no addon widens the builder" keep their meaning with `Lifetime`
  replaced by the map.
- An optional demand (typed with `undefined`) is a slot that may stay unspent — today's tag.
- Open: where `Demands` is read from — the type parameter (per-container, no global merging; the
  sketch above) or a merged interface addons declare into. The builder works either way.

## Phase 2 — signoffs owed before implementation (2026-09-02)

- [x] Before implementation: REVISE `docs/phase2-request-door.design.md` (branch
      `feat-di-request-door`) against every ruling below dated 2026-09-02 — it predates all of them
      (class-shaped `Request`, unregistered request + `RequestPlan`, `ControlService` umbrella,
      disposable `Handle`, private `active`, no helpers, shadowing resolves beneath, null lifetime
      hidden-on-inputs). The tasklist is the truth where the two disagree.
- [x] DONE 2026-09-02 — the two 2026-09-01 snapshot refs were verified superseded and deleted.

The phase 2 design (`docs/phase2-request-door.design.md` on `feat-di-request-door`, commit
`f565bdb8`) is complete and revised against the hooks ruling. It waits on these owner answers; each is
Claude's recommendation, none is ruled. The first-design items 1–3 and 8–10 were briefed to the
revising agent AS IF ruled — they are not; they are listed here to be answered.

Internal, non-exported:

-
  1. [x] DISSOLVED — `Request` is the class; no `DefaultRequest`.
-
  2. [x] DISSOLVED — the abstract class carries the shared members.
-
  3. [x] RULED 2026-09-02 — yes, as `RequestPlan` (kind `'request'`), the owner's name. It takes the
         place the old `service-provider` plan kind held; the provider is a seeded factory reading
         `request.serviceProvider`. The three request addresses are value registrations carrying a
         sentinel; no per-ask Registry, the plan memo intact. The two internal symbols ride along.
-
  4. [x] RULED 2026-09-02 — yes; the owner's one directive: BEST RUNTIME PERFORMANCE. Install and
         dispose are cold and may cost whatever precomputation buys the ask path; the ask path walks
         only what is active, allocates nothing, and skips every hook kind nobody implements.

Exported from di.core:

-
  5. [x] RULED 2026-09-02 — `Handle extends Disposable` with `index`; disposing IS the uninstall. No
         `uninstall()` on the handle and no `uninstall(handle)` verb on the control.
-
  6. [x] RULED 2026-09-02 — ONE umbrella `ControlService`, exported from di.core, the engine's own
         surface reached through the door: `registry: Iterable<Registration<unknown>>` (the
         registrations the engine resolves against), `stageHooks(hooks): Handle` (gated — in effect
         only for an ask that activated the handle), `installHooks(hooks): Handle` (always active,
         outermost). No `uninstall` verb (5). `Control<T>` and `controlLifetime` DELETE: the umbrella
         is its own specific address, so no marker wrapper is needed, and the separate registry
         ask goes with it. The seeded control registrations are two: `IServiceProvider` and
         `ControlService`. The word "roster" is banned — it is the registry; sweep it from comments.
-
  7. [x] RULED 2026-09-02 — NOT public. `private readonly active: Handle[]` (TS `private`, not
         `#`), so the engine and tests reach it by element access, `request['active']`. Inspection of
         an ask is what the hooks are for.

Behaviour:

-
  8. [x] RULED 2026-09-02 — hooks fire only at registration-carrying nodes, never at
         engine-synthesised ones; `Hooks.Construction.registration` drops its optional marker. Contract
         line that rides along: the consumer a hook sees is the NEAREST REGISTERED ANCESTOR, skipping
         synthesised glue (a singleton consuming a tuple holding a scoped service is the consumer of
         that scoped service).
-
  9. [x] RULED 2026-09-02 — `afterConstruct` is skipped when `beforeConstruct` answered a result;
         "after" means after a construction happened.
-
  10. [x] RULED 2026-09-02 — seeds file oldest; a user registration at the same address shadows a
          seeded one. "Permanent" means always present, not unbeatable.
          RULED with it — SHADOWING RESOLVES BENEATH: a registration whose own slot names its own
          address (a factory for `Foo` shaped `Func<[Foo], Foo>`) gets the SHADOWED registration as
          that dependency — matching for a self-named slot starts after the registration being
          planned. Decoration with no verb. Consequences: no older match is unsatisfiable (throws,
          never delegates); a collection ask still enumerates every match, decorator and shadowed
          both. Divergence from the reference, which throws a cycle here; outside the lifetime model.
          - [x] Described in `docs/libraries/di.md` §14 with the `Func<[Foo], Foo>` example
          (landed with the phase 2 docs fallout).
-
  11. [x] RULED 2026-09-02 — HIDE ON INPUTS, EXPLICIT ON OUTPUTS. The seeded lifetime is `null` at
          runtime, cast in at the two seed sites. Inputs (`Registration.*` factories, the builder,
          `Manifest.add`) type the slot `Lifetime`; `controlLifetime` and its union member DELETE.
          Outputs that can hand a seeded row back (the engine's own reads; `ControlService.registry`,
          whose vocabulary is `unknown`) admit `null`, and the `registry` doc says the engine's two
          rows carry it. Hooks stay `Registration<Lifetime>` — they never fire at a seeded node. The
          seeded rows are NOT hidden from the registry.

Ruled 2026-09-02 from the owner's review of the queue:

- [x] NO HELPERS for the fold-time control asks. `registryOf` and `hooksControlOf` do not exist; a
      middleware spells the ask inline, `next(new ControlRequest(typefor<HooksControl>()))`, and the
      roster ask's control guard plus `new Registry(…)` inline at the two validation call sites.
- [x] RULED 2026-09-02: `Request` is an exported
      `abstract class` in di.core with `ServiceRequest` and `ControlRequest` exported as its two
      inheritors; the union alias goes; `serviceProvider` lives on `ServiceRequest` only; the arm
      check is `instanceof`; `DefaultRequest`, `RequestMembers` and the arm symbol all dissolve
      (items 1 and 2 with them).
- [x] RULED 2026-09-02 (the owner's own position, confirmed): the request is NOT registered — the
      planner answers a slot naming any of the three request classes with `Plan.request(address)`,
      and the sentinel symbol goes (re-spelling item 3). The control services STAY registrations:
      engine-seeded factories appended oldest, values from the engine's closure or the request,
      lifetime `null`, hooks never fire at them.

Open, needs a design answer:

-
  12. [x] RULED 2026-09-02 — moot. Requests are made only inside `ServiceProvider`, whose class is
          private (the interface alone is exported); no user ever mints one. Neither a minting helper
          nor a `ControlRequest` class. An addon outside di reaches a control the way it reaches any
          service: through the provider it holds.

Also open from the design, for visibility (no owner word needed unless he objects): `beginResolve`'s
`injected` is `undefined` at the door and a `{ state }` redirect does not survive a latebound
re-entry; the demoted make inside a registered-promise envelope runs no hooks; one
`Hooks.Construction` carrier per behaviour per hooked node is the one per-node allocation the hook
contract forces.

## Overnight 2026-09-02 — findings for the owner (nothing here is ruled)

- **The example app wedge is step 7.** `examples.app.without-transformer` hangs after "Hosting
  started" because the engine's `IServiceProvider` seed is designed but unbuilt: the worker's ctor
  asks for `Type.from('ServiceProvider')` (the reserved spelling for `IServiceProvider`), nothing
  answers it, and `Host.start` resolves hosted services as a COLLECTION — the planner drops an
  unbuildable member silently (`PlannerVisitor.#planElements`, `.filter(isDefined)`), so the host
  starts zero services and `waitForShutdownAsync` waits forever. A single ask for the same address
  throws loud. Proven: one forwarding registration at that address in a scratch copy unwedges the
  host section byte-for-byte, and the tour then fails at the same root in chapter-local containers
  (three more sites depend on the reserved token). The fix IS step 7, in phase-1 shape — one
  engine-owned registration `{ address: typefor<IServiceProvider>(), factory: request =>
  request.serviceProvider, lifetime: control }` — parked with phase 2 per the owner's hold. Two
  nuances at fix time: `resolution-demo` asserts the resolved provider is a view, not the container
  object (the JIT-wrap rule answers it: mint a fresh wrap); and the phase-2 design addresses the
  factory's slot as `ServiceRequest`.
- **Design question surfaced by it:** a collection ask silently drops unbuildable members. A wiring
  error became a zero-service host with no diagnostic. Whether collections should refuse (or hosting
  should log when zero hosted services resolve) is the owner's call.
- **Separate, runtime-level:** bun 1.3.14 busy-polls its event loop at 100% of a core when a process
  is kept alive only by signal handlers (`ConsoleLifetime` registers three) with no armed timer or IO.
  Minimal repro: `bun -e 'process.on("SIGINT",()=>{}); await new Promise(()=>{});'`. Any armed timer
  drops it to idle. Hosting's concern, not di's.
- **Derivation findings from the blind suite (`b3834cf2`):** (a) a defaulted parameter derives as
  required where TypeScript types it optional — a typefor-never-lies defect, being fixed on the
  branch; (b) a parameter typed through a LOCAL, unexported alias derives as an imported address
  naming an unimportable name — same family as the private-ctor question; (c) a generic class whose
  ctor takes `T` refuses derivation (`TYPE_ARG_TYPE_UNDERIVABLE`) rather than minting a hole —
  pinned as the refusal that exists; whether an open type parameter should auto-mint a hole is a
  design question.
- **Benchmarks, tip vs classic (source-first both sides, core-pinned, 7 interleaved rounds, min of
  medians; the bench worktrees no longer existed and were reconstructed from preserved copies):**
  transient leaf 216 vs 250 ns; depth-8 1,020 vs 3,039; width-10 1,354 vs 3,755; factory-1dep 324
  vs 612 — the tip wins every resolution it can express, roughly 102 ns fixed per ask + 114 ns per
  node against 250 + 350. It LOSES build/manifest-200: 2.57 ms vs 0.67 ms (Registry materialisation
  plus per-registration `Object.freeze` at build). Singleton/scoped/scope-lifecycle scenarios cannot
  run on the tip (no lifetime model). Absolutes are not comparable to `docs/benchmarks.md`'s dist
  run. Artifacts under the session scratchpad `bench/`.
- **Docs sweep left alone, deliberately:** §204, §206, §207, §210, §211, §219, §221, §222 and
  §215's model-chronicle tail describe the owner-ruled Starfish/useHooks surface that step 9
  deleted; the owner decides whether they leave the log or are rewritten.

## Two questions the owner has not answered (2026-09-02)

- [x] RULED 2026-09-02: LEAVE. **Beneath the engine.** The ruling says user extensibility may compose below the engine, but
      `build()` folds every addon above it and the engine's `next` reaches only the terminus, so
      there is no position to compose into. The builder review resolved it in DOCS ("beneath the
      engine only the terminus stands"). Claude's pick: LEAVE — the mechanism (the engine calls
      `next`) exists; the addon surface that places something beneath it is a later addition when a
      real fallback consumer exists. Alternative: give addons a position now. One word.
- [x] RULED 2026-09-02: LEAVE — the owner had misread the code; the ask is withdrawn. **`Registry.getMatches` and `hasMatch`.** The owner asked for `getMatches` to use `hasMatch`
      in its body and `hasMatch` to use `bindGenerics`; the second half is done. `getMatches` needs
      the generics `bindGenerics` returns and `hasMatch` answers only a boolean, so the first half
      means binding twice: a per-registration `hasMatch(registration, address)` used by both, with
      `getMatches` binding again for the generics on a hit — or leave `getMatches` on
      `bindGenerics` as it is. One word: TWICE or LEAVE.

## Session — phase 2 request door (2026-09-02, branch `feat-di-request-door`)

Steps 5–8 of the di execution order, built to the 2026-09-02 rulings; every commit on
`feat-di-request-door` above `c8561b3`, pushed.

**Commits landed**

- `b45de4c` docs(di) — the design doc revised in place to the ruled shape before any code.
- `754a3cc` feat(di.core) — `Request` abstract class + `ServiceRequest`/`ControlRequest`,
  `ControlService`, `Handle extends Disposable`; `Control<T>`/`controlLifetime` deleted;
  `Hooks.Construction.registration` required; the lifetime slot loses the control union member.
- `0668f98` feat(di) — the two seeds (provider view + control), `RequestPlan` answered from the
  ask in flight, shadowing-resolves-beneath (`Match.index`, `getMatches` start,
  `visitBeneath`), `InstalledHooks` with the two-tier dispatch, validation addons inline the
  control ask, `registryOf` deleted.
- `3acb829` test(di.test) — `engine-request-door` + `installed-hooks` suites; requests minted as
  class instances; the direct self-loop cycle test rewritten to the beneath rule; the
  universal-address test repinned (see decisions below).
- `984898b` docs(di) — READMEs, `docs/libraries/di.md` §12–§14 (hook tiers, the ask as a
  service, shadowing), §230/§231 corrected in place, example comments.
- `ce494a5` docs(tasklist) — dprint reflow.
- `702a96c` fix(di.extras) — return annotations on the observing as-door bodies (di.core's new
  d.ts made the inferred set un-nameable, TS2883).
- `15b6681` fix(di) — seed-ness keyed on the engine's two rows by identity (review lens 1: a
  user null-lifetime registration must not suppress hooks); regression test.
- `635eaf5` perf(di) — shared frozen empty context, loop-built call args, the construction
  protocol skipped when no construction-kind hook participates (review lens 2).
- `4140f1d` docs(di) — design doc re-synced to the built shape (review lens 3).

**Gates** (before → after; "before" is the branch baseline at `c8561b3`)

- `tests/di.test`: 105 pass / 6 skip / 18 fail → 125 pass / 6 skip / 18 fail; the 18 are the
  same lifetime-model load failures, no new file fails to load (one net test moved: the
  engine-delegation registry-control case replaced the deleted `Control` one; validation kept 6).
- `bun run build`: green (after `702a96c`). `bun run format:check`: green.
- `bun run test`: red only with the known deleted-lifetime-export load failures (37 sites across
  ten `*.test` packages, all `noopLifetimeAddon`/`di`/`standardLifetimeAddon`/
  `StandardScopeFactory`); no expect-level failure anywhere. `bun run lint`: red only in those
  same test packages, same missing exports.
- e2e: `bun run test:e2e` — all suites green except `inline.ttsc.e2e` (3 pass / 1 fail: its
  parity fixture imports the deleted `noopLifetimeAddon`; pre-existing).
- Both example apps build, run, and byte-match `expected.txt` — the step 7 wedge is closed.

**Decisions I had to make** (unruled gaps; each flagged for reversal)

- The seeded `IServiceProvider` factory answers a FRESH `ServiceProvider` view forwarding to
  `request.serviceProvider.getService(type)` — the prompt's "mint a fresh provider wrap per
  handout" read together with the demo's pinned `view !== provider` line; a by-reference answer
  would print `false` there.
- A registration addressed by nothing but a hole matches the control ask itself (user rows are
  newer than seeds), so `validateUniversalAddresses` can no longer reach its per-registration
  diagnostic: the build still refuses, via the inline control guard's `UnsatisfiableError`. The
  test was repinned to that behavior (accepted-weaker-diagnostic precedent, ruled 2026-09-01).
  Consequence worth the owner's eye: the addon's `ManifestValidationError` branch is in practice
  unreachable for exactly the defect it names.
- Seed-ness is identity (`Engine.isSeeded`, the two rows), not `lifetime === null` — a user
  registration carrying null runs hooks normally.
- `Plan.request` synthesis sits in `visitImported`, so a user registration at a request-class
  address shadows it like everything else.
- Dispatch middleware-form semantics where unruled (beginResolve `next` return, a middleware
  discarding a deeper `{ result }`): implemented to the Behavior doc's reading; noted in the
  design doc's Open section.

**Left undone / for the owner**

- Review lens 2 findings not taken (recorded in this session's transcript): per-ask
  precomputation of the activated per-kind lists (per-node flag rechecks today, O(A) per kind per
  hooked node); one `Hooks.Construction` carrier per KIND per behavior (three for a behavior
  implementing all three — sharing one changes carrier identity, needs a ruling); memoizing the
  invoker path's per-call re-plan; a negative-plan marker for delegated misses (every delegated
  ask pays a failed plan + full registry scan today — interacts with "caches nothing").
- `Request`'s per-ask `active: []` allocation could be lazied, but the ruled member shape spells
  the field; left as ruled.

**Decision-log entries touched**: §230 rewritten in place to the ruled door (request classes,
seeds, null lifetime, shadowing-beneath, hook tiers); §231 gains the request-classes exception to
"a name never resolves without a registration". Nothing else in the log was written.

**Addendum (owner ask, 2026-09-02): the portable floor and the lifetime contract**

- `tests/di.test/test/container-contract.test.ts` — 12 black-box tests using only the public
  surface, each valid under MEDI modulo naming: constructor injection, transient-style fresh
  construction, instance registrations, factory-taking-the-provider, last-registration-wins,
  refusal of an unregistered address, collections in registration order (empty for an
  unregistered element type), keyed isolation both directions, open-generic closing, the A→B→A
  cycle, and the provider as an injectable that resolves. Deliberately excluded (divergent by
  ruling): self-referential registrations (we decorate, MEDI cycles), provider identity (we hand
  a fresh view, MEDI hands itself), engine delegation, requests, hooks.
- `tests/di.test/test/lifetime-contract.test.ts` — the lifetime behavior contract as 26
  `test.todo` entries (green as todos; each throws under `--todo` until a model lands), one per
  MEDI lifetime behavior: singleton sharing/laziness/once-only factory/instance passthrough,
  scoped per-scope identity and root refusal under scope validation, transient freshness,
  captivity under both switch positions, disposal (reverse order, scope-owned transients,
  never-dispose-supplied-instances, async/sync split, disposed refusals), scope mechanics, per-
  element collection lifetimes, and build-time validation. Scope-validation DEFAULTS are
  deliberately unpinned — the known reference-default divergence is the owner's open call. These
  entries are the behavior-without-structure brief the clean-room model (step 15) is written
  against; bodies get filled in against whatever addon surface the owner's requirements doc
  (step 14) lands.
- Gate after both: di.test 137 pass / 6 skip / 26 todo / 18 fail (same 18 dead-model load
  failures); the new files typecheck clean.

**Addendum (design-session handoff, 2026-09-02): hook and dispose seams**

- `beforePlan` joins `Hooks` (di.core): fired once per registered node as the planner makes it —
  lazily at first resolution, and at build when `validateBuildability()` plans every closed
  address — answering the state the node's dependencies are planned under; handler/koa by arity,
  optional on `Behavior`, staged-vs-installed gating as the other four (a build pass has no ask
  behind it, so only always-active behaviors participate there); never at seeded rows or
  synthesised nodes; plan-memo hits fire nothing. Threading lives in `PlannerVisitor`
  (`openPlanned`/`closePlanned`), the ask supplies its context through `Plan.from`'s trailing
  hooks argument, and a hook-firing candidate whose signature then fails to lower is the one
  soft edge (noted in the design doc's Open section... recorded here instead: the hook fires per
  attempted match, so an unbuildable newest candidate fires before the older match answers).
- `IServiceProvider extends Disposable, AsyncDisposable` (di.core); `ServiceProvider` implements
  both, idempotent across forms, free when nothing subscribed, and `whenDisposed(subscriber)` is
  the seam: each subscriber told once, most recent first, through the form the holder used —
  per provider, never through `getService`.
- Gates: di.test 148 pass / 6 skip / 26 todo / 18 fail (the known load-failing set unchanged);
  di + di.core tsc/eslint clean; both example apps byte-match; dprint clean.

## Session — standard lifetime model (2026-09-02, branch feat-di-standard-lifetime)

Built from `21b569ed` on `IServiceManifest-repair` to `docs/standard-lifetime-model.design.md` and
`docs/standard-lifetime-model.reference-behavior.md`, with the door session's seams cherry-picked
(`2025c648..origin/feat-di-request-door`, three commits: the `beforePlan` hook, provider disposal
with `ServiceProvider.whenDisposed`, and its tasklist addendum).

**Landed**

- `libraries/di.core/src/StandardLifetime.ts` — the vocabulary type.
- `libraries/di.core/src/IServiceScopeFactory.ts` — `openScope()`.
- `libraries/di.core/src/Errors.ts` — `ObjectDisposedError`; both types and the error on the
  `di.core` barrel.
- `libraries/di/src/addons/standard-lifetime/standard-lifetime.ts` — `standardLifetime()`: the
  marker layer, the staged hooks (`beginResolve` / `beforeConstruct` / `afterConstruct`), the
  value-registered scope factory, `openScope()` minting a `ServiceProvider` over its own marker,
  release through `whenDisposed` in the form the holder used.
- `libraries/di/src/addons/standard-lifetime/scope.ts` — the `Scope` state, the two-level cache,
  capture, and the two disposal walks (dedupe by reference at first capture, reverse order, error
  aggregation, idempotence).
- `libraries/di/src/addons/standard-lifetime/validate-scopes.ts` — `validateScopes()` and
  `ScopeValidationError`: the captive check on `beforePlan`, the per-ask check on
  `beforeConstruct`, the kind threaded as its state.
- `libraries/di/src/addons/standard-lifetime/symbols.ts` — the two request symbols, module-level.
- `libraries/di/src/index.ts` — `standardLifetime`, `validateScopes`, `ScopeValidationError`
  beside the two validators; `ObjectDisposedError` re-exported with the taxonomy.
- Tests, `tests/di.test/test/`: `standard-lifetime.test.ts` (§1, §2, §5, §7),
  `standard-lifetime-disposal.test.ts` (§3 and the after-disposal table of §2),
  `validate-scopes.test.ts` (§4), and `lifetime-contract.test.ts` — the door session's 26 todo
  entries, each now an executable test against the model.
- Docs: `docs/libraries/di.md` §16 and the error paragraph; `libraries/di/README.md` and
  `libraries/di.core/README.md` key-export rows and a note.

**Gate numbers**

- `tests/di.test`: 271 pass / 6 skip / 18 fail (base commit: 137 pass / 6 skip / 26 todo / 18 fail;
  the 26 todos became passing tests; the 18 failures are the same 18 load failures as the base).
  `tsc -p tsconfig.types.json` clean.
- `bun run test`: red only in the same ten `*.test` packages as the base
  (`augmentations`, `caching.memory`, `di`, `diagnostics.core`, `diagnostics`, `hosting.core`,
  `hosting`, `logging.config`, `logging`, `options.augmentations`), every failure one of the 37
  known deleted-export load sites (`noopLifetimeAddon` ×32, `di` ×2, `StandardScopeFactory` ×2,
  `standardLifetimeAddon` ×1). No expect-level failure anywhere. `bun run test:e2e`: every suite
  green except `inline.ttsc.e2e`, whose parity fixture imports the deleted `noopLifetimeAddon`
  (pre-existing).
- `bun run lint`: every library clean (di and di.core through eslint); red only in the same ten
  test packages, same missing exports. `bun run format:check`: clean. `bun run build`: green.

**Test files still red, and why**

The 18 load failures under `tests/di.test/` are the same 18 as on the base commit; none is new,
none was brought back, per the brief's rule for files that conflict or that the documents are
silent on:

- Silent — 15 files importing the deleted `di` builder, 14 of them with the deleted
  `noopLifetimeAddon` (`di.usingLifetimeModel(noopLifetimeAddon()).configureServices(…)`):
  `aggregate-resolution`,
  `async-resolution`, `baseline-e2e`, `captivity-constant-products`, `chain-composition`,
  `container-builder`, `describe-dialect`, `get-service-absence`, `get-service-value`,
  `object-resolution`, `open-registration`, `open-signature`, `plan-cache`, `union-resolution`,
  `whole-type-precedence`. They assert engine behavior
  the design doc and the catalogue say nothing about, through a builder API that no longer exists.
  Left as they are.
- Silent — `tagged-lifetime-model.test.ts`: a different model (`taggedLifetimeAddon`,
  `TaggedScopeFactory`) the documents do not mention. Left as it is.
- Conflicts — `standard-lifetime-model.test.ts`, questions for the owner:
  - `standardLifetimeAddon().name === 'standard'` and the `.transient` statics: no such members
    in the design's public declarations.
  - `StandardScopeFactory.address` on `di`: the design places `IServiceScopeFactory` in `di.core`.
  - "refuses a scoped ask at the root scope" by default, as `LifetimeModelError` with cause
    `ScopedAtRootError`; and "the two validation switches are both on by default" with options
    `{ validateOnBuild, validateScopes }`: the design has validation off unless `validateScopes()`
    is added, no options object, and `ScopeValidationError` thrown as itself.
  - "a registration naming no lifetime is refused, naming the model": the design makes the
    vocabulary strict at the type level and specifies no runtime refusal (see decisions).
  - The assertions that fall inside the documents — singleton/scoped/transient identity, a scope
    opened from inside a scope keeping its own instances, the unvalidated captive pair resolving
    with the singleton holding the promoted instance — are covered by `standard-lifetime.test.ts`
    and `lifetime-contract.test.ts`.
- Conflicts — `standard-lifetime-model-disposal.test.ts`, questions for the owner:
  - teardown reached by resolving a `StandardScopeTeardown` address, and "the provider the builder
    seals carries neither symbol": `IServiceProvider` is now disposable in both forms and the
    provider is the scope.
  - "tears a child scope down before releasing what the parent itself kept": the catalogue (§2,
    "Root disposal walks no scope list") has the container's disposal leave an open scope's
    instances to that scope.
  - "never disposes a transient instance, since nothing tracks it": the catalogue (§3) captures
    transients in the resolving scope.
  - the `{ keep, release }` datum widening (an `'external'` opt-out, a release override): not in
    the design's vocabulary.
  - `DisposedScopeError` naming the factory's address on `openScope` after disposal: the design
    names `ObjectDisposedError`.
  - a synchronous teardown meeting one async-only instance surfacing an `AggregateError` of one:
    the catalogue rethrows a single error as itself.
  - The refusal wrapped in `LifetimeModelError` with the model's error as `cause`: the design
    throws `ObjectDisposedError` as itself.
  - The assertions that fall inside — LIFO release, reference dedupe, idempotence in both forms,
    aggregation of several failures, `Symbol.asyncDispose` preferred by the asynchronous form,
    value registrations never disposed, a promise product awaited then released — are covered by
    `standard-lifetime-disposal.test.ts`.
- Green but stale: `disposal-error-taxonomy.test.ts` asserts only that `DisposedError` is not
  exported, which holds; its header comment says the disposed refusal "stays model-private and
  reaches a caller only wrapped in LifetimeModelError", which the design's `ObjectDisposedError`
  in `di.core` contradicts. The test is left as it is.

**Decisions the design doc did not settle**

- `IServiceProvider` under a singleton's dependencies. The engine's seeded `IServiceProvider` row
  is invisible to hooks, so the model cannot override it from `beforeConstruct` as the design
  sketched. The model files its own `IServiceProvider` registration (a transient factory that is
  never called) shadowing the seed, and answers it from `beforeConstruct` with the provider of the
  scope the construction runs under: the scope's own provider object in a scope, the container's
  under a `root` state. That row is a second entry in `Addon.registrations` beside the scope
  factory, not a new public declaration. Consequence: `resolveMany(IServiceProvider)` now
  enumerates the model's row and the seed.
- The container's own provider is not reachable at fold time — `build()` mints it after the chain
  folds and `whenDisposed` is an instance method — so the model adopts it on its first ask (every
  `ServiceRequest` reaching the container's marker carries it, since the seed's views forward to
  it) and subscribes then. Gap this leaves: a container disposed before any ask ever went through
  it is never told, so a later ask or `openScope()` through it is not refused. Every scope is
  opened through a factory resolved from the container, so this cannot affect scopes.
- `validateScopes()` installs with `installHooks`, not `stageHooks`: a scope's provider is minted
  over the shared implementation and never passes through another addon's middleware, so a staged
  handle from a validator composed outside the model would never be activated for scope asks, and
  the captive check while inside an open scope (§4) would be lost. Installed hooks also run for
  the build-time plan under `validateBuildability()`.
- Fold order decides when the captive check fires at build. The chain folds innermost first, so
  `validateBuildability()` plans under `beforePlan` only when composed AHEAD of `validateScopes()`
  (`Builder.useAddon(validateBuildability()).useAddon(validateScopes()).useAddon(standardLifetime())`).
  Composed behind it, the plans are made before the hook exists and the per-ask check catches the
  same graph at the first construction. Documented in di.md §16 and the di README; tested both
  ways.
- An ended scope leaves the `scopes` map instead of staying with `disposed: true`: the marker and
  `beginResolve` treat an unknown id as disposed, which keeps every refusal the design lists while
  not holding every scope a long-running container ever opened. The scope's cache object itself is
  never cleared, as the design says.
- The synchronous walk records a plain `Error` for an instance offering only
  `Symbol.asyncDispose` (the design lists no error type for it and forbids new public types); the
  instance is left undisposed, as in the catalogue.
- A promise that settles after its owning scope ended: the settled value is disposed at once and
  the `ObjectDisposedError` the design prescribes for a late capture is not thrown, since nothing
  awaits the capture and the caller already holds the promise; throwing would only surface as an
  unhandled rejection.
- A registration whose lifetime is outside the vocabulary (a `null` or `undefined` lifetime the
  types refuse but the runtime can carry): the model neither caches nor captures it and threads
  the state through, as for a value. The old suite expected a runtime refusal; the design makes
  the vocabulary strict at the type level and says nothing about a runtime guard.
- `ScopeValidationError` carries one message for both conditions (the scoped address, and that it
  was reached under the singleton scope from the container's provider or a singleton's
  dependencies); the catalogue's three messages are collapsed, the conditions are not.
- The design's `disposed(id)` check in the marker also covers a latebound closure minted in a
  scope and invoked after that scope ended: such a call re-enters at the door without passing the
  marker, so `beginResolve` repeats the refusal.

**Could not do / deviations**

- Author email: a push with `goliyth@gmail.com` as the committer email is rejected by GitHub
  ("push declined due to email privacy restrictions"), so every commit carries
  `Thomas Butler <2511516+fnrhombus@users.noreply.github.com>` instead — the same author as the
  base commit.
- The Workflow tool's subagents cannot call tools in this environment (every parameterized tool
  call fails in the harness's permission handler), so the adversarial review ran through the
  Agent tool in the same shape: five sonnet reviewers, one per catalogue section, each asked to
  show a test and its catalogue section disagree. Five reviews returned. Nothing they reported was an implementation divergence the model can
  fix within the design; two are divergences the design's own mechanisms cannot close, listed
  under the owner's questions below; the rest were coverage gaps, all closed (scoped
  retry-after-failure and pending-promise sharing, a scoped last registration promoted from the
  container, `IServiceProvider` resolved from the container being that provider, a scope
  surviving the disposal of the scope its factory was resolved from, a singleton dependency
  captured before a sibling throws, a singleton promise pending when the container ends, the
  built-ins never captured).
- Catalogue §1's thread-safety items (call-site locks, per-scope `Sync`) have no analog in a
  single-threaded runtime; the one observable, once-only creation under concurrent asynchronous
  asks, is what the cached pending promise gives and what is tested.

**Questions for the owner — behavior the catalogue names that the design's mechanisms cannot give**

- A collection ask is a live query and is never cached as a whole. The catalogue (§1) has the
  enumerable call site cached at the widest of its elements' locations, so an all-singleton
  collection is one array for the container's life and a singleton-plus-scoped one is rebuilt once
  per scope. Here each element honors its own lifetime and the collection object is fresh per ask.
  Hooks fire only at registration-carrying nodes, never at the engine's synthesised collection
  node, so a hooks-only model cannot cache the collection itself. Untested either way; the design's
  behavior map names only the per-element mechanism.
- A promise product that settles after its owning scope ended is disposed on settlement, but the
  promise the caller holds still fulfils with the disposed instance. The catalogue (§3) has a
  resolution racing a dispose "never return a value to its caller". Rejecting the caller's promise
  needs the model to hand back a derived promise, which is `canonicalize` — the hook the design
  marks "not used". Tested for what it does (disposal on settlement), not for what it cannot.
- `validateBuildability()` plans one closed address once, so a captive dependency in a shadowed
  registration of an address whose newest registration is clean is not reported at build; the
  catalogue (§4) validates every descriptor. The per-ask check still refuses it when a collection
  ask walks that element. The fix is in `Registry.closedAddresses` / `planClosedAddresses` under
  `libraries/di/src/internal/`, which this session does not touch.

## Session — tagged lifetime model (2026-09-03, branch feat-di-tagged-lifetime)

Built from `origin/feat-di-standard-lifetime` at `263aca92` to `docs/tagged-lifetime-model.design.md`,
rebased onto that branch's tip `76de762f` (the standard session's report push and the design doc's own
commits). The standard session's report landed mid-session, so the disposal walk was moved to the
shared module below rather than duplicated. Every commit is authored `Claude <noreply@anthropic.com>`:
GitHub refused every push carrying `goliyth@gmail.com` (GH007, private-email protection), and the
checkout's stop hook asks for that author; the owner was told live and can re-author.

**Landed**

- `libraries/di.core/src/ITaggedServiceScopeFactory.ts` — `ITaggedServiceScopeFactory<Lifetime>`
  with `openScope(lifetime: Exclude<Lifetime, undefined>)`; on the `di.core` barrel.
- `libraries/di/src/addons/tagged-lifetime/tagged-lifetime.ts` — `taggedLifetime<Lifetime>()`: the
  installer middleware answering the head, the one staged set of hooks (`beginResolve` answers the
  chain, `beforeConstruct` answers a hit or passes, `afterConstruct` binds the addon's own factory
  registration by identity and stores and captures tagged nodes), the factory filed as a constructor
  registration with no lifetime at `ITaggedServiceScopeFactory<%Lifetime>`.
- `libraries/di/src/addons/tagged-lifetime/layer.ts` — `Layer`: the per-scope cache and owned
  list, the source that refuses when ended and appends the layer to the ask's chain, the
  `ServiceProvider` minted over it and subscribed through `whenDisposed`.
- `libraries/di/src/addons/tagged-lifetime/TaggedServiceScopeFactory.ts` — the concrete factory,
  `source` rebound by `afterConstruct`.
- `libraries/di/src/addons/tagged-lifetime/symbols.ts` — the `chain` request symbol, module-level.
- `libraries/di/src/addons/lifetime-scope.ts` — the two-level cache (`lookup`/`store`/`evict`),
  `capture`, and both disposal walks, shared by the standard and tagged models and exported from no
  barrel; `standard-lifetime/scope.ts` keeps the standard model's `Scope` over the shared shapes and
  `standard-lifetime.ts` imports the walk from the shared module. Behavior unchanged.
- `libraries/di/src/index.ts` — `taggedLifetime` beside `standardLifetime`.
- Tests, `tests/di.test/test/`: `tagged-lifetime.test.ts` (caching, the chain, transients, the
  factory, the provider, open registrations, several registrations, failures, promises),
  `tagged-lifetime-disposal.test.ts` (capture, the walk, the two forms, errors, refusal after
  disposal, promise products), `tagged-lifetime.types.ts` (`openScope(undefined)` and an unknown tag
  do not compile; the addon locks the vocabulary).
- Docs: `docs/libraries/di.md` §17 beside §16; `libraries/di/README.md` key-export row and note;
  `libraries/di.core/README.md` factory row, and the `ObjectDisposedError` row now names both models.

**Gate numbers**

- `tests/di.test`: 341 pass / 6 skip / 18 fail (base tip: 271 pass / 6 skip / 18 fail; the 70 new
  tests all pass; the 18 failures are the same 18 load failures as the base). `tsc -p tsconfig.types.json`
  clean; the package's `tsc -p tsconfig.json` names none of the new files.
- `bun run test`: red only in the same ten `*.test` packages as the base, every failure a deleted-export
  load site (`noopLifetimeAddon` and the old `di` builder); no expect-level failure anywhere. The
  `&&` in the root script stops before e2e when unit tests are red, so `bun run test:e2e` was run on
  its own: five suites green, `inline.ttsc.e2e` red on the same deleted `noopLifetimeAddon` import.
- `bun run lint`: every library clean (di and di.core through eslint); red only in the same ten test
  packages, same missing exports. `bun run format:check`: clean. `bun run build`: green.

**Test files still red, and why**

The 18 load failures are the base's 18; none is new. Seventeen are the standard session's list
(fifteen importing the deleted `di` builder, the two `standard-lifetime-model*` files) and are left
as they were. The eighteenth is this model's:

- `tagged-lifetime-model.test.ts` — written against a deleted API (`di.usingLifetimeModel`,
  `taggedLifetimeAddon`, `TaggedScopeFactory`, `LifetimeModelError`). Its assertions fall in
  three groups. Inside the design, replaced by tests of the same behavior in
  `tagged-lifetime.test.ts` and `tagged-lifetime-disposal.test.ts`: kept by the scope carrying its
  tag, separately per scope, reaching past scopes of other tags, shared by nested scopes, the nearest
  same-tag scope wins, an untagged registration is fresh per ask, no scope carrying the tag resolves
  transiently from the built provider and from another tag's scope and is kept again once a scope
  opens, a `'session'`-tagged registration builds and resolves without any captivity sweep. Silent —
  the design names no such members: `taggedLifetimeAddon().name === 'tagged'` and the `.transient`
  statics. Conflicts, questions for the owner: `openScope` on a factory whose scope was disposed
  throws at open time an error named `DisposedScopeError` whose message names `TaggedScopeFactory`
  (line 117); the design names `ObjectDisposedError` and has the refusal fall on every ask through
  the scope opened, not on `openScope` itself. The file also registers a tag named `'root'`. Left
  red as it is.

**Decisions the design did not settle**

- The open factory address is spelled `typefor<ITaggedServiceScopeFactory<Generic<'Lifetime'>>>()`,
  the repository's form for a hole; the ctor type is `Type.ctor(<that address>, [[]])`.
- `TaggedServiceScopeFactory.source` starts as a function that throws a plain `Error` naming the
  model, reached only if the factory were constructed outside an ask the model's hooks run under.
- `openScope` over an ended scope does not throw at open time: the design's `openScope` carries no
  check and the factory holds a source, not a layer; the scope it answers refuses every ask.
- `beginResolve` throws `ObjectDisposedError` when the built provider or any layer on the ask's chain
  has ended. Review found that a latebound closure re-enters under its captured request without
  crossing the layers again, so without this an ended scope refused it only when the product was
  disposable, and by reconstructing first. The hook still answers `{ chain }` for every live ask.
- The head learns of the built provider on that provider's first `ServiceRequest` and subscribes its
  `whenDisposed` then, the standard model's mechanism. A built provider disposed before it was ever
  asked anything is not known to the model and goes on answering; the standard model has the same
  edge. Closing it needs a build-time seam the engine does not offer.
- `Layer.tag` is typed `unknown`: the layer is internal and compared by `===` to `registration.lifetime`.
  A registration whose lifetime is `undefined` is left to the engine before any layer is consulted,
  so a layer opened with `undefined` through a cast caches nothing.
- `IServiceProvider` injected is the engine's own row: a fresh view forwarding to the provider the
  ask came from, never the provider object itself, so the tests assert it by what it resolves rather
  than by identity.
- "A user's own registration of the factory address wins" holds by registry order: the test files the
  user's registration through `withServices` after `useAddon(taggedLifetime())`, as the design's
  usage does.
- `afterConstruct` stores before it captures, as the design's row orders it, so a node constructed
  while its layer ends leaves an entry in a cache no ask can reach again; review noted it, left as
  designed.
- The second-dispose test observes the contract through `ServiceProvider`, which already tells a
  subscriber once; the walk's own guard is exercised only through that path.

**Reviews** — three adversarial reviews against the design doc (behavior suite, disposal suite,
implementation and docs). Fixed: a "descendants first" test that only showed sibling independence,
a factory-binding test that could not tell the head from any other source, a missing shared-pending-
promise-that-rejects case, the latebound re-entry refusal above, an asynchronous single-failure
walk test, a `di.md` snippet that used a binding outside its block, a hoisted `typefor` const, the
README's `ObjectDisposedError` row, and a sentence on which provider an injected factory binds to.

**Not done** — no pull request, per the brief. Orchestration ran through the Agent tool (three
sonnet reviewers; one Fable implementer) rather than the Workflow tool. The owner's live instruction
mid-session to rebranch from `IServiceManifest-repair` was carried out and then withdrawn; nothing
from that detour remains on the branch.
**Owner FYI (2026-09-02), recorded for the model sessions:** the old tagged tests — the deleted
tagged lifetime model's suites among the load-failing files — are NOT to be read as requirements.
This sharpens the clean-room brief's existing rule (the reference outranks the tests; over-spec is
challenged and cut): for the tagged side, the surviving files carry no contract at all.

## Session — di test suite completion (2026-09-03, branch test-di-suite-complete)

Built from `origin/IServiceManifest-repair` at `dace0f30`. Started 01:17 UTC; the model serving the
session was rate-limited from 01:33 to 06:21 UTC, so the wall clock overran the owner's 45 minutes
while no work was possible; the working time was about 35 minutes. Commits are authored
`Thomas Butler <2511516+fnrhombus@users.noreply.github.com>`: GitHub refuses every push carrying
`goliyth@gmail.com` (GH007, private-email protection), so the author email is the base commit's
noreply address and the name is the one the brief asks for.

**Gate numbers**

| gate                   | before (`dace0f30`)                                                                                                     | after                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `tests/di.test`        | 341 pass / 6 skip / 18 fail (18 files failing to load)                                                                  | 468 pass / 0 skip / 0 fail, 37 files, 0 files failing to load             |
| `bun run test` (unit)  | ten packages red on deleted-export load sites (`noopLifetimeAddon`, the `di` builder object, `StandardScopeFactory`, …) | every package green, exit 0                                               |
| `bun run test` (e2e)   | `inline.ttsc.e2e` red on the deleted `noopLifetimeAddon` import; the other suites green                                 | every suite loads; the six `*.ttsc.e2e` suites self-skip here (see below) |
| `bun run lint`         | red in the same ten test packages                                                                                       | exit 0, every package                                                     |
| `bun run format:check` | clean                                                                                                                   | clean                                                                     |
| `bun run build`        | green                                                                                                                   | green                                                                     |

The six transformer parity suites (`inline`, `declare-by-depending`, `di.registration`, and the
three others under `tests/*.ttsc.e2e`) gate on `mise which go` and skip themselves when mise is
absent, which it is in this sandbox (Go is on the path from `/usr/local/go`, which is how the build's
transformer compiled). Every one of them now loads; their bodies did not execute here. The rewritten
calls in `inline-parity.test.ts` were type-checked with `tsc --noEmit` and are the same call shapes
that run green in the unit packages.

**Files in `tests/di.test/test/`**

- Rewritten to the current builder (`Builder.withServices(fn).build()`, the exact behavior of the
  deleted model that retained nothing), every test kept: `aggregate-resolution`, `async-resolution`,
  `baseline-e2e`, `describe-dialect`, `get-service-absence`, `get-service-value`,
  `object-resolution`, `open-registration`, `open-signature`, `plan-cache`, `whole-type-precedence`.
  These assert engine behavior; the tests outside the four documents are listed below.
- `union-resolution` — same rewrite; its cycle test asserted `CycleError` for a slot naming its own
  address, which the request-door design ("shadowing resolves beneath") makes unsatisfiable, never a
  cycle. Now asserts that, and a real cycle across two addresses.
- `container-builder` — rewritten against `Builder`: single and several `withServices` steps, a
  discarded manifest registers nothing, a ready-made manifest, builder immutability, `useAddon` order
  (an ask crosses addons in call order; a later addon's registration wins), `validateBuildability`,
  and the scope-factory address unsatisfiable without a model and answerable by a user registration.
  The test of a deleted verb (`usingManifest` discarding earlier steps) is gone; the vacuous
  `expect(provider).toBeDefined()` now asserts the failure surfaces on resolution.
- `chain-composition` — the hand-fold rewritten to `Engine.getService(request, next)` and
  `standardLifetime()`'s `{ registrations, middleware }`.
- `captivity-constant-products` — rewritten to `validateBuildability() + validateScopes() +
  standardLifetime()`: a value dependency is no captive; a value beside a scoped dependency does not
  hide the captive (catalogue §4).
- `disposal-error-taxonomy` — header and assertions now state the design: `ObjectDisposedError` is
  in di.core beneath `DiError`, `@rhombus-std/di` re-exports the same class, no `DisposedError`.
- `disposal.types.ts` — its premise (no dispose members on `IServiceProvider`) contradicted the
  design; now checks both symbols exist and `using` / `await using` bind.
- `latebound-memo-identity` — a lint error only (`Type.tuple` spec names its `rest`).
- `planner-visitor` — the empty skipped two-phase union test is a real test of the one-pass rule.
- `realize-visitor` — the skipped `service-scope-factory` and four `scoped caching` placeholders
  removed: the design files the scope factory as an ordinary registration and puts caching in the
  models' hooks, so no visitor behavior exists to test; comments point to the suites that cover it.
- Deleted whole: `standard-lifetime-model.test.ts`, `standard-lifetime-model-disposal.test.ts`,
  `tagged-lifetime-model.test.ts`. Every assertion inside the documents is already in
  `standard-lifetime`, `standard-lifetime-disposal`, `lifetime-contract`, `tagged-lifetime`,
  `tagged-lifetime-disposal` (checked test by test); the rest asserts deleted shapes (`.name`,
  `.transient`, `LifetimeModelError`, `DisposedScopeError`, `StandardScopeFactory`,
  `TaggedScopeFactory`) or contradicts the documents (the "promise out of reach" test against "a
  promise's settled value is what is captured").
- Skips and todos: 6 → 0. None kept.
- Coverage added, one test each unless noted: `standard-lifetime.test.ts` — the marker contract
  (two tests: the kind and scope id an ask carries through the container's own provider and through
  an opened scope), a wide scoped tree of twelve siblings; `standard-lifetime-disposal.test.ts` — a
  disposed scope and the disposed container refuse before any construction runs (two tests), a
  transient holding the provider it was resolved from disposed with its scope exactly once;
  `engine-request-door.test.ts` — a user registration at a request address answers first;
  `installed-hooks.test.ts` — hooks installed after asks have run fire for the next ask, the consumer
  a construction sees is the nearest registered ancestor with a collection node between them
  skipped.

**Tests kept that fall outside the four documents** (they pass and contradict nothing; deleting
working engine coverage would have been worse than keeping it): the migrated engine suites above
(`baseline-e2e` except its `IServiceProvider` test, `union-resolution` except its cycle tests, and
the other nine), `chain-composition`'s hand-fold tests, `container-builder`, and the planner-visitor
one-pass test.

**Defects fixed in library code**: none. No test written to a specification failed against the
code, and no specification needed a new public member. No blocker.

**Dependents adapted** (tests only; no dependent's library code broke): the rewrite
`di.usingLifetimeModel(noopLifetimeAddon()).usingManifest(X).build()` →
`Builder.withServices(() => X).build()` in `tests/augmentations.test` (2 files),
`tests/caching.memory.test` (2), `tests/diagnostics.core.test` (1), `tests/diagnostics.test` (1),
`tests/hosting.core.test` (2), `tests/hosting.test` (1), `tests/inline.ttsc.e2e` (1),
`tests/logging.config.test` (3), `tests/logging.test` (1), `tests/options.augmentations.test` (6).
Six tests skipped earlier for want of singleton caching run again under
`Builder.withServices(...).useAddon(standardLifetime()).build()`: `logging.test` "registers a
working singleton ILoggerFactory over the added providers", `logging.config.test` "the open
`ILoggerProviderConfig<$1>` registration closes per provider", both `diagnostics.test` "resolves as a
singleton fed by every add*Config call" tests, and the two `caching.memory.test` singleton tests,
whose bodies had been reduced to empty stubs and are rebuilt over `getMemoryCacheManifest()` /
`getDistributedMemoryCacheManifest()`. Per package after: augmentations 19, caching.memory 32,
diagnostics.core 101, diagnostics 8, hosting.core 13, hosting 38, logging.config 13, logging 36,
options.augmentations 24 pass, 0 skip each.

**Reviews** — one adversarial sonnet review over every rewritten file against the three documents
in its scope. Two findings, both fixed: `baseline-e2e`'s provider-injection test was named for a
provider identity it cannot distinguish with one provider (renamed to what it asserts), and the
taxonomy file's describe label undersold its second test. Everything else was found spec-consistent
and non-vacuous.

**Could not do**

- The transformer parity suites did not execute (mise absent, above).
- The Workflow tool was not used; orchestration ran through the Agent tool: two Fable implementers
  on disjoint directories, four sonnet readers building the coverage map, one sonnet reviewer, one
  further Fable implementer for the coverage gaps.
- One wording question for the owner, no code changed: the design's marker table says the scope id
  is "absent" on the container's own provider, while the marker stamps the key with the value
  `undefined` (`scopeId in request` is true). The model reads the id by value, so the test asserts
  the value is `undefined`; whether the marker should skip the write is the owner's call.
- The request-door rows marked `MISSING` below are the design's implementation notes (allocation
  counts, snapshot isolation mid-ask, fast-path internals, the example app) with no black-box
  observation; the catalogue rows marked `MISSING` are either internal (constructor order, cache
  retention), absent from this runtime (reflective type checks, constrained generics, `IsService`),
  or the two owner questions the standard session already raised (a collection cached as a whole,
  build validation planning one closed address once).

**Coverage map**

One table per document. `MISSING` names the reason. Rows the catalogue states as thread-safety
have no single-threaded analog and are marked so.

### `standard-lifetime-model.design.md`

| Spec row                                                                                                                                                                             | Test file                          | Test name                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The addon — the scope factory is registered as a single instance, resolvable from every provider, always the same one                                                                | standard-lifetime.test.ts          | describe('scopes') › test('the scope factory is resolvable from the container and from any scope, always the same instance')                                                                                                  |
| Opening a scope — each `openScope()` call mints a fresh, independent scope                                                                                                           | standard-lifetime.test.ts          | describe('scoped') › test('two scopes get two instances')                                                                                                                                                                     |
| Opening a scope — markers never stack: opening a scope from inside a scope is identical to opening from the container (child of the container, not of the opening scope)             | standard-lifetime.test.ts          | describe('scopes') › test('a scope opened through a factory resolved inside a scope is a child of the container, not of that scope')                                                                                          |
| Opening a scope — every open scope is independent: its own cache                                                                                                                     | standard-lifetime.test.ts          | describe('scopes') › test("sibling scopes never see each other's instances")                                                                                                                                                  |
| Opening a scope — every open scope is independent: its own disposables                                                                                                               | standard-lifetime-disposal.test.ts | describe('the walk') › test('disposing one scope touches neither another scope nor the singletons')                                                                                                                           |
| Opening a scope — only singletons are shared, because every provider passes through the one implementation middleware                                                                | standard-lifetime.test.ts          | describe('singleton') › test('resolving from a scope answers the container-wide instance')                                                                                                                                    |
| Opening a scope — disposing the provider `openScope()` returned disposes that scope's disposables; other scopes and the singletons are untouched                                     | standard-lifetime-disposal.test.ts | describe('the walk') › test('disposing one scope touches neither another scope nor the singletons')                                                                                                                           |
| The marker contract — lifetime kind is `'singleton'` on the addon's own provider, `'scoped'` on an opened scope                                                                      | standard-lifetime.test.ts          | describe('scoped') › test("resolved from the container's own provider without validation, it is cached with the singletons for every later container ask")                                                                    |
| The marker contract — scope id is absent on the addon's own provider, a unique `Symbol` on an opened scope                                                                           | standard-lifetime.test.ts          | the marker contract › an ask through the container's own provider carries the 'singleton' kind and no scope id; › an ask through an opened scope carries the 'scoped' kind and that scope's own id, a Symbol unique per scope |
| Resolution behavior — singleton entered via the `'singleton'` provider: singleton cache                                                                                              | standard-lifetime.test.ts          | describe('singleton') › test('one instance per container: every resolve and every injection site shares it')                                                                                                                  |
| Resolution behavior — singleton entered via a scope: singleton cache                                                                                                                 | standard-lifetime.test.ts          | describe('singleton') › test('resolving from a scope answers the container-wide instance')                                                                                                                                    |
| Resolution behavior — scoped entered via the `'singleton'` provider: singleton cache (promoted; validation turns this into an error)                                                 | standard-lifetime.test.ts          | describe('scoped') › test("resolved from the container's own provider without validation, it is cached with the singletons for every later container ask")                                                                    |
| Resolution behavior — scoped entered via a scope: that scope's cache                                                                                                                 | standard-lifetime.test.ts          | describe('scoped') › test('one instance per scope, shared by everything resolved in that scope')                                                                                                                              |
| Resolution behavior — transient entered via the `'singleton'` provider: fresh instance, that provider owns disposal                                                                  | standard-lifetime-disposal.test.ts | describe('which scope owns a transient') › test("a transient resolved from the container's own provider is held until the container disposes")                                                                                |
| Resolution behavior — transient entered via a scope: fresh instance, that scope owns disposal                                                                                        | standard-lifetime-disposal.test.ts | describe('which scope owns a transient') › test('a transient resolved from a scope is disposed with that scope')                                                                                                              |
| Resolution behavior — a transient is resolvable from any provider                                                                                                                    | standard-lifetime.test.ts          | describe('transient') › test('never kept, in a scope or out of one')                                                                                                                                                          |
| Resolution behavior — a transient injected into a singleton lives as long as the singleton; not a validation error                                                                   | standard-lifetime.test.ts          | describe('transient') › test('a transient injected into a singleton is constructed once and kept with it')                                                                                                                    |
| Validation — scoped resolved from the `'singleton'` provider, refused when the layer is added                                                                                        | validate-scopes.test.ts            | describe("a scoped registration reached from the container's own provider") › test('resolved directly, it is refused, naming the scoped address')                                                                             |
| Validation — captive dependency (scoped injected into a singleton), refused when the layer is added                                                                                  | validate-scopes.test.ts            | describe('a scoped registration consumed by a singleton') › test('directly, it is refused when the singleton is resolved from the container')                                                                                 |
| Validation — validate on build, catches captive dependencies at build time when composed                                                                                             | validate-scopes.test.ts            | describe('when the captive check fires') › test('at build, under validateBuildability composed ahead of it, whichever order the pair was registered in')                                                                      |
| Validation — all validation layers are off unless added                                                                                                                              | lifetime-contract.test.ts          | describe('scoped') › test("with scope validation off, a scoped service resolved from the root behaves as the root scope's own")                                                                                               |
| Public declarations — a value registration behaves as a pre-built singleton instance: handed back as it stands from every provider                                                   | standard-lifetime.test.ts          | describe('the built-in registrations') › test('a value registration is handed back as it stands from every provider')                                                                                                         |
| Public declarations — a value registration is never captured for disposal                                                                                                            | standard-lifetime-disposal.test.ts | describe('what is captured') › test('an instance handed to a registration is never disposed by the container')                                                                                                                |
| Public declarations — a scope is its provider: disposing the provider `openScope()` returned ends the scope                                                                          | standard-lifetime-disposal.test.ts | describe('what is captured') › test('a scoped instance is disposed with its scope, and only then')                                                                                                                            |
| The chain — the scope factory is filed as a value registration: the one instance everywhere, never captured for disposal                                                             | standard-lifetime-disposal.test.ts | describe('the walk') › test('the built-in registrations are never captured: a scope handing out its provider and a singleton holding the factory dispose cleanly')                                                            |
| The chain — the marker throws `ObjectDisposedError` before entering the implementation, for a disposed scope                                                                         | standard-lifetime-disposal.test.ts | describe('after disposal') › test('resolving from a disposed scope refuses, while the container and other scopes go on')                                                                                                      |
| The chain — the container's own provider is subscribed the same way, at fold time, to release root on its own disposal                                                               | standard-lifetime-disposal.test.ts | describe('what is captured') › test('a constructed singleton is disposed with the container')                                                                                                                                 |
| State inside the implementation — an open-generic registration gets one cache entry per closing                                                                                      | standard-lifetime.test.ts          | describe('open registrations') › test('an open singleton is cached once per closing')                                                                                                                                         |
| State inside the implementation — several registrations of one address get one entry each, keeping `resolveMany` elements distinct and the newest identical to the single resolution | standard-lifetime.test.ts          | describe('several registrations of one address') › test('the last element of a collection ask is the very instance a single ask answers')                                                                                     |
| The hooks — `beginResolve` answers the `Scope` for `request[scopeId]`, root when the key is absent                                                                                   | standard-lifetime.test.ts          | describe('scoped') › test('two scopes get two instances')                                                                                                                                                                     |
| The hooks — `beforeConstruct`, singleton: hit in `root.cache` answers the cached result, a miss constructs under root                                                                | standard-lifetime.test.ts          | describe('singleton') › test('a singleton factory runs once, however many resolves follow')                                                                                                                                   |
| The hooks — `beforeConstruct`, scoped: same rule against `state.cache`, which is `root.cache` under root                                                                             | standard-lifetime.test.ts          | describe('scoped') › test("resolved from the container's own provider without validation, it is cached with the singletons for every later container ask")                                                                    |
| The hooks — `beforeConstruct`, transient/value/engine row: fresh state, uncached                                                                                                     | standard-lifetime.test.ts          | describe('transient') › test('a fresh instance per resolve and per injection site')                                                                                                                                           |
| The hooks — `afterConstruct` stores under the same rule; transient stores nothing                                                                                                    | standard-lifetime.test.ts          | describe('transient') › test('never kept, in a scope or out of one')                                                                                                                                                          |
| The hooks — `afterConstruct` captures the instance only when it offers `Symbol.dispose` or `Symbol.asyncDispose`                                                                     | standard-lifetime-disposal.test.ts | describe('what is captured') › test('an instance offering neither protocol is simply not tracked')                                                                                                                            |
| The hooks — `afterConstruct` captures a singleton in root                                                                                                                            | standard-lifetime-disposal.test.ts | describe('what is captured') › test('a constructed singleton is disposed with the container')                                                                                                                                 |
| The hooks — `afterConstruct` captures scoped and transient in `state`, the owning scope                                                                                              | standard-lifetime-disposal.test.ts | describe('which scope owns a transient') › test('a transient injected into a scoped registration is owned by that scope')                                                                                                     |
| The hooks — an owning scope already disposed disposes the instance at once and throws `ObjectDisposedError`                                                                          | standard-lifetime-disposal.test.ts | describe('after disposal') › test('an instance constructed while its scope is disposing is disposed at once and the ask refuses')                                                                                             |
| The hooks — `canonicalize`: not used                                                                                                                                                 | MISSING                            | the base model's non-use of a canonicalize hook has no independently observable effect for a test to assert                                                                                                                   |
| The hooks — the plan-time hook: not used by the model                                                                                                                                | MISSING                            | the base model's non-use of a plan-time hook has no independently observable effect for a test to assert (validateScopes()'s own plan-time hook is covered separately)                                                        |
| The hooks — what the construction produced is cached, a promise included, so concurrent asynchronous resolutions share one pending construction                                      | standard-lifetime.test.ts          | describe('asynchronous constructions') › test('concurrent asks for a pending singleton share one construction')                                                                                                               |
| The hooks — a promise that rejects evicts its entry, so the next ask retries                                                                                                         | standard-lifetime.test.ts          | describe('asynchronous constructions') › test('a singleton whose construction rejects is forgotten, so the next ask constructs again')                                                                                        |
| The hooks — a promise's settled value is what is captured for disposal, on settlement                                                                                                | standard-lifetime-disposal.test.ts | describe('asynchronous products') › test('a promise product is captured on settlement and disposed with its scope')                                                                                                           |
| The hooks — `IServiceProvider` resolved under a singleton's dependencies is the container's own provider, not the provider the ask entered through                                   | standard-lifetime.test.ts          | describe('scopes') › test("the provider a singleton is handed is the container's, wherever the singleton was first reached")                                                                                                  |
| Disposal — disposing a scope's provider marks the scope disposed                                                                                                                     | standard-lifetime-disposal.test.ts | describe('after disposal') › test('resolving from a disposed scope refuses, while the container and other scopes go on')                                                                                                      |
| Disposal — the walk deduplicates the disposables list by reference                                                                                                                   | standard-lifetime-disposal.test.ts | describe('the walk') › test('one instance captured under several addresses is disposed once, where it was first captured')                                                                                                    |
| Disposal — the walk runs in reverse of creation order                                                                                                                                | standard-lifetime-disposal.test.ts | describe('the walk') › test('disposes in reverse order of creation')                                                                                                                                                          |
| Disposal — the walk collects every error rather than stopping                                                                                                                        | standard-lifetime-disposal.test.ts | describe('errors during disposal') › test('two failures dispose everything else and throw one AggregateError carrying both')                                                                                                  |
| Disposal — one error rethrows as itself                                                                                                                                              | standard-lifetime-disposal.test.ts | describe('errors during disposal') › test('one failure disposes everything else and rethrows the failure itself')                                                                                                             |
| Disposal — more than one error throws an `AggregateError`                                                                                                                            | standard-lifetime-disposal.test.ts | describe('errors during disposal') › test('two failures dispose everything else and throw one AggregateError carrying both')                                                                                                  |
| Disposal — the synchronous form records an error for an instance that has only `Symbol.asyncDispose`                                                                                 | standard-lifetime-disposal.test.ts | describe('the two forms against the two protocols') › test('the synchronous form counts an instance offering only Symbol.asyncDispose as an error and still disposes the rest')                                               |
| Disposal — the asynchronous form awaits each and calls a synchronous-only instance synchronously                                                                                     | standard-lifetime-disposal.test.ts | describe('the two forms against the two protocols') › test('the asynchronous form awaits each asynchronous instance and calls a synchronous-only one directly, in order')                                                     |
| Disposal — a second dispose is a no-op                                                                                                                                               | standard-lifetime-disposal.test.ts | describe('the walk') › test('a second disposal does nothing, in either form')                                                                                                                                                 |
| Disposal — the cache is kept; resolution through a disposed scope's provider refuses first with `ObjectDisposedError`                                                                | standard-lifetime-disposal.test.ts | after disposal › a disposed scope refuses before any construction runs; › the disposed container refuses before any construction runs (the kept cache itself is not observable once every ask refuses)                        |
| Disposal — disposing the container's provider performs the same walk over root                                                                                                       | lifetime-contract.test.ts          | describe('disposal') › test('disposing the container disposes the singletons it constructed, most recent first')                                                                                                              |
| Disposal — afterwards every provider, the container's and every scope's, throws `ObjectDisposedError` on resolution                                                                  | standard-lifetime-disposal.test.ts | describe('after disposal') › test('resolving from a scope that was open when the container was disposed refuses')                                                                                                             |
| Disposal — afterwards `openScope` throws `ObjectDisposedError`                                                                                                                       | standard-lifetime-disposal.test.ts | describe('after disposal') › test('opening a scope from the disposed container refuses, through a factory resolved earlier')                                                                                                  |
| Disposal — an open scope's own list is disposed only when that scope's provider is disposed                                                                                          | standard-lifetime-disposal.test.ts | describe('the walk') › test("disposing the container leaves an open scope's own instances to that scope")                                                                                                                     |
| validateScopes() — the plan-time hook answers `'singleton'` under a singleton registration                                                                                           | validate-scopes.test.ts            | describe('what the checks let stand') › test('a transient consumed by a singleton')                                                                                                                                           |
| validateScopes() — the plan-time hook throws `ScopeValidationError` for a scoped registration under a singleton state                                                                | validate-scopes.test.ts            | describe('a scoped registration consumed by a singleton') › test('directly, it is refused when the singleton is resolved from the container')                                                                                 |
| validateScopes() — the captive check fires once per plan: at build under `validateBuildability()`, otherwise at first resolution                                                     | validate-scopes.test.ts            | describe('when the captive check fires') › test('without validateBuildability, at the first ask that plans the singleton, from any provider')                                                                                 |
| validateScopes() — `beginResolve` reads `request[lifetimeKind]`; `beforeConstruct` throws for a scoped registration reached under a `'singleton'` state                              | validate-scopes.test.ts            | describe("a scoped registration reached from the container's own provider") › test('resolved directly, it is refused, naming the scoped address')                                                                             |
| validateScopes() — the per-resolution check fires on every ask, not only the first                                                                                                   | validate-scopes.test.ts            | describe("a scoped registration reached from the container's own provider") › test('the refusal fires on every ask, not only the first')                                                                                      |
| validateScopes() — the scope factory is a value, never constructed, so a singleton holding it never trips either check                                                               | validate-scopes.test.ts            | describe('what the checks let stand') › test('the scope factory held by a singleton')                                                                                                                                         |
| Behavior map — §1 caches, last wins, per-element lifetimes                                                                                                                           | standard-lifetime.test.ts          | describe('several registrations of one address') › test('a single ask answers the last registration, under its own lifetime alone')                                                                                           |
| Behavior map — §1 once-only creation, failure never cached                                                                                                                           | standard-lifetime.test.ts          | describe('creation failure') › test('a singleton whose construction throws caches nothing, so the next ask constructs again')                                                                                                 |
| Behavior map — §2 flat scopes, one factory, `IServiceProvider`                                                                                                                       | standard-lifetime.test.ts          | describe('scopes') › test('a scope opened through a factory resolved inside a scope is a child of the container, not of that scope')                                                                                          |
| Behavior map — §2 unvalidated scoped from root promoted                                                                                                                              | standard-lifetime.test.ts          | describe('scoped') › test("resolved from the container's own provider without validation, it is cached with the singletons for every later container ask")                                                                    |
| Behavior map — §3 capture rules, ownership, order, dedupe, errors                                                                                                                    | standard-lifetime-disposal.test.ts | describe('the walk') › test('disposes in reverse order of creation')                                                                                                                                                          |
| Behavior map — §4 validation, both checks at their own moments                                                                                                                       | validate-scopes.test.ts            | describe('when the captive check fires') › test('at build, under validateBuildability composed ahead of it, whichever order the pair was registered in')                                                                      |
| Behavior map — §5 built-ins                                                                                                                                                          | standard-lifetime.test.ts          | describe('the built-in registrations') › test('the scope factory is never constructed, so a singleton may hold it')                                                                                                           |
| Behavior map — §6 keyed services                                                                                                                                                     | MISSING                            | explicitly out of scope in the design; no test targets keyed services since the feature does not exist                                                                                                                        |

### `standard-lifetime-model.reference-behavior.md` (§1–5, §7)

| Catalogue item                                                                               | Test file                                                | Test name                                                                                                                                                     |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §1 singleton caches on the container                                                         | standard-lifetime.test.ts                                | singleton › one instance per container: every resolve and every injection site shares it                                                                      |
| §1 scoped caches per scope                                                                   | standard-lifetime.test.ts                                | scoped › one instance per scope, shared by everything resolved in that scope                                                                                  |
| §1 transient never cached, only captured                                                     | standard-lifetime.test.ts                                | transient › a fresh instance per resolve and per injection site                                                                                               |
| §1 the plan tree as a third cache shared by container and scopes                             | —                                                        | MISSING: internal plan cache, not observable black-box (engine's `plan-cache.test.ts` covers the engine side)                                                 |
| §1 last wins for a single ask                                                                | standard-lifetime.test.ts                                | several registrations of one address › a single ask answers the last registration, under its own lifetime alone                                               |
| §1 last wins looks only at the last registration's lifetime                                  | standard-lifetime.test.ts                                | several registrations of one address › a single ask answers the last registration even when an earlier one is scoped and the ask comes from the container     |
| §1 a collection ask: one element per registration, own lifetime, registration order          | standard-lifetime.test.ts                                | several registrations of one address › a collection ask answers every registration in registration order, each under its own lifetime                         |
| §1 the last element of a collection ask is the single ask's instance                         | standard-lifetime.test.ts                                | several registrations of one address › the last element of a collection ask is the very instance a single ask answers                                         |
| §1 a collection cached at the widest of its elements' locations                              | —                                                        | MISSING: a collection ask is a live query here (owner question, standard session report); no mechanism in the design                                          |
| §1 plan-tree lock, two threads                                                               | —                                                        | no single-threaded analog                                                                                                                                     |
| §1 once-only creation under concurrent asks (container)                                      | standard-lifetime.test.ts                                | asynchronous constructions › concurrent asks for a pending singleton share one construction                                                                   |
| §1 once-only creation under concurrent asks (scope)                                          | standard-lifetime.test.ts                                | asynchronous constructions › concurrent asks for a pending scoped construction share it, and a rejection is forgotten                                         |
| §1 circular-dependency guard                                                                 | engine-request-door.test.ts / container-contract.test.ts | `CycleError` on a cycle (engine-level, model-independent)                                                                                                     |
| §1 singleton creation failure caches nothing                                                 | standard-lifetime.test.ts                                | creation failure › a singleton whose construction throws caches nothing, so the next ask constructs again                                                     |
| §1 the original error surfaces unwrapped                                                     | standard-lifetime.test.ts                                | creation failure › the original error surfaces from the resolve, not a wrapped one                                                                            |
| §1 scoped creation failure caches nothing                                                    | standard-lifetime.test.ts                                | asynchronous constructions › a scoped construction that throws caches nothing in the scope, so the next ask constructs again                                  |
| §2 every scope is a direct child of the container, never nested                              | standard-lifetime.test.ts                                | scopes › a scope opened through a factory resolved inside a scope is a child of the container, not of that scope                                              |
| §2 flat scopes dispose independently                                                         | standard-lifetime-disposal.test.ts                       | the walk › disposing the scope a factory was resolved from leaves the scope it opened untouched: scopes are flat                                              |
| §2 the scope is its own provider                                                             | standard-lifetime.test.ts                                | scopes › the provider resolved inside a scope is that scope's own                                                                                             |
| §2 a scope opened from inside a scope gets its own instance                                  | standard-lifetime.test.ts                                | scoped › a scope opened from inside a scope gets its own instance, independent of the opener                                                                  |
| §2 `IServiceProvider` from the container is the container's                                  | standard-lifetime.test.ts                                | scopes › the provider resolved from the container's own provider is that provider itself                                                                      |
| §2 a scoped service is handed its scope's provider                                           | standard-lifetime.test.ts                                | scopes › the provider a scoped service is handed is that scope's own                                                                                          |
| §2 a singleton is handed the container's provider wherever first reached                     | standard-lifetime.test.ts                                | scopes › the provider a singleton is handed is the container's, wherever the singleton was first reached                                                      |
| §2 one scope factory, same instance everywhere                                               | standard-lifetime.test.ts                                | scopes › the scope factory is resolvable from the container and from any scope, always the same instance                                                      |
| §2 the container's scope is constructed first                                                | —                                                        | MISSING: constructor ordering, not observable                                                                                                                 |
| §2 unvalidated scoped from the container is promoted                                         | standard-lifetime.test.ts                                | scoped › resolved from the container's own provider without validation, it is cached with the singletons for every later container ask                        |
| §2 disposing the container disposes its own instances                                        | standard-lifetime-disposal.test.ts                       | what is captured › a constructed singleton is disposed with the container                                                                                     |
| §2 disposing a scope disposes only that scope                                                | standard-lifetime-disposal.test.ts                       | the walk › disposing one scope touches neither another scope nor the singletons                                                                               |
| §2 resolve on a disposed container refuses                                                   | standard-lifetime-disposal.test.ts                       | after disposal › resolving from the disposed container refuses                                                                                                |
| §2 openScope on a disposed container refuses                                                 | standard-lifetime-disposal.test.ts                       | after disposal › opening a scope from the disposed container refuses, through a factory resolved earlier                                                      |
| §2 resolving from a scope open when the container was disposed refuses                       | standard-lifetime-disposal.test.ts                       | after disposal › resolving from a scope that was open when the container was disposed refuses                                                                 |
| §2 container disposal walks no scope list                                                    | standard-lifetime-disposal.test.ts                       | the walk › disposing the container leaves an open scope's own instances to that scope                                                                         |
| §2 the refusal is one error type whichever provider disposed                                 | standard-lifetime-disposal.test.ts                       | after disposal › (every refusal asserted `ObjectDisposedError`)                                                                                               |
| §2 disposing a scope leaves the container usable                                             | standard-lifetime-disposal.test.ts                       | after disposal › resolving from a disposed scope refuses, while the container and other scopes go on                                                          |
| §3 an instance offering neither protocol is not tracked                                      | standard-lifetime-disposal.test.ts                       | what is captured › an instance offering neither protocol is simply not tracked                                                                                |
| §3 the scope's own provider is never captured                                                | standard-lifetime-disposal.test.ts                       | the walk › the built-in registrations are never captured: a scope handing out its provider and a singleton holding the factory dispose cleanly                |
| §3 factory-made instances are captured like constructed ones                                 | standard-lifetime-disposal.test.ts                       | what is captured › a factory-made instance is disposed like a constructed one                                                                                 |
| §3 a value registration is never captured                                                    | standard-lifetime-disposal.test.ts                       | what is captured › an instance handed to a registration is never disposed by the container                                                                    |
| §3 a transient from a scope is disposed with that scope                                      | standard-lifetime-disposal.test.ts                       | which scope owns a transient › a transient resolved from a scope is disposed with that scope                                                                  |
| §3 a transient from the container is held until the container disposes                       | standard-lifetime-disposal.test.ts                       | which scope owns a transient › a transient resolved from the container's own provider is held until the container disposes                                    |
| §3 an instance captured before a sibling throws is still owned                               | standard-lifetime-disposal.test.ts                       | which scope owns a transient › an instance constructed during an ask that later fails is still owned, and disposed                                            |
| §3 reverse order of creation                                                                 | standard-lifetime-disposal.test.ts                       | the walk › disposes in reverse order of creation                                                                                                              |
| §3 a shared dependency disposed after its dependents                                         | standard-lifetime-disposal.test.ts                       | the walk › a shared dependency is disposed after every one of its dependents                                                                                  |
| §3 dedupe by reference, first capture wins                                                   | standard-lifetime-disposal.test.ts                       | the walk › one instance captured under several addresses is disposed once, where it was first captured                                                        |
| §3 dedupe under many aliases                                                                 | standard-lifetime-disposal.test.ts                       | the walk › one instance captured under many addresses is still disposed once                                                                                  |
| §3 a second dispose no-ops in either form                                                    | standard-lifetime-disposal.test.ts                       | the walk › a second disposal does nothing, in either form                                                                                                     |
| §3 sync form: async-only instance is an error, the rest still disposed                       | standard-lifetime-disposal.test.ts                       | the two forms against the two protocols › the synchronous form counts an instance offering only Symbol.asyncDispose as an error and still disposes the rest   |
| §3 async form calls a sync-only instance directly                                            | standard-lifetime-disposal.test.ts                       | the two forms against the two protocols › the asynchronous form awaits each asynchronous instance and calls a synchronous-only one directly, in order         |
| §3 one failure rethrown as itself, everything else disposed                                  | standard-lifetime-disposal.test.ts                       | errors during disposal › one failure disposes everything else and rethrows the failure itself                                                                 |
| §3 two failures: one AggregateError                                                          | standard-lifetime-disposal.test.ts                       | errors during disposal › two failures dispose everything else and throw one AggregateError carrying both                                                      |
| §3 async walk resumes in order after awaiting                                                | standard-lifetime-disposal.test.ts                       | the two forms against the two protocols › the asynchronous form awaits each asynchronous instance … in order                                                  |
| §3 the cache is never cleared on scope disposal                                              | —                                                        | MISSING: not observable once every ask refuses                                                                                                                |
| §3 a construction racing a dispose is disposed at once and the ask refuses                   | standard-lifetime-disposal.test.ts                       | after disposal › an instance constructed while its scope is disposing is disposed at once and the ask refuses                                                 |
| §3 same lock serializes dispose and resolution                                               | —                                                        | no single-threaded analog                                                                                                                                     |
| §4 both switches off by default                                                              | lifetime-contract.test.ts                                | scoped › with scope validation off, a scoped service resolved from the root behaves as the root scope's own                                                   |
| §4 captive: scoped directly under a singleton refused                                        | validate-scopes.test.ts                                  | a scoped registration consumed by a singleton › directly, it is refused when the singleton is resolved from the container                                     |
| §4 captive through a transient                                                               | validate-scopes.test.ts                                  | a scoped registration consumed by a singleton › through a transient, it is refused                                                                            |
| §4 captive through a singleton                                                               | validate-scopes.test.ts                                  | a scoped registration consumed by a singleton › through another singleton, it is refused                                                                      |
| §4 captive while inside an open scope                                                        | validate-scopes.test.ts                                  | a scoped registration consumed by a singleton › through a singleton reached beneath a scoped registration, it is refused while inside an open scope           |
| §4 the container-scope check fires only from the container                                   | validate-scopes.test.ts                                  | a scoped registration reached from the container's own provider › the same registration resolved from an opened scope is answered                             |
| §4 scoped resolved directly from the container refused                                       | validate-scopes.test.ts                                  | a scoped registration reached from the container's own provider › resolved directly, it is refused, naming the scoped address                                 |
| §4 non-scoped from the container needing a scoped dependency refused                         | validate-scopes.test.ts                                  | a scoped registration reached from the container's own provider › resolved beneath a transient, it is refused                                                 |
| §4 the two situations carry different messages                                               | —                                                        | MISSING: `ScopeValidationError` carries one message, the conditions are distinct (standard session decision)                                                  |
| §4 the check runs on every ask                                                               | validate-scopes.test.ts                                  | a scoped registration reached from the container's own provider › the refusal fires on every ask, not only the first                                          |
| §4 plan walk cached once, per-ask check every time                                           | validate-scopes.test.ts                                  | the refusal fires on every ask … (the plan-time half: when the captive check fires › at build …)                                                              |
| §4 a refusal caches nothing                                                                  | validate-scopes.test.ts                                  | a scoped registration reached from the container's own provider › a refusal caches nothing: the scoped registration is still answered from a scope afterwards |
| §4 last wins under validation                                                                | validate-scopes.test.ts                                  | several registrations of one address › a single ask from the container is refused only when the last registration is scoped                                   |
| §4 collection validated per element                                                          | validate-scopes.test.ts                                  | several registrations of one address › a collection ask from the container is refused only where a scoped element is walked                                   |
| §4 the scope factory in a singleton passes                                                   | validate-scopes.test.ts                                  | what the checks let stand › the scope factory held by a singleton                                                                                             |
| §4 build validation runs once at build and implies the captive check                         | validate-scopes.test.ts                                  | when the captive check fires › at build, under validateBuildability composed ahead of it, whichever order the pair was registered in                          |
| §4 build validation skips open registrations                                                 | —                                                        | MISSING: not exercised                                                                                                                                        |
| §4 a value registration never trips the captive check at build                               | validate-scopes.test.ts                                  | when the captive check fires › a pre-built instance never trips the check at build: it has no dependencies to plan                                            |
| §4 per-registration failures wrapped naming the registration                                 | validate-scopes.test.ts                                  | when the captive check fires › the build-time failure names the singleton whose plan reached the scoped registration, with the refusal as its error           |
| §4 every registration attempted, failures aggregated in order                                | lifetime-contract.test.ts                                | build-time validation › with build validation on, an unbuildable registration fails the build, every failure reported together                                |
| §4 build catches the captive pair in either registration order                               | validate-scopes.test.ts                                  | when the captive check fires › at build … whichever order the pair was registered in                                                                          |
| §4 an unresolvable dependency is its own inner failure                                       | lifetime-contract.test.ts                                | build-time validation › … every failure reported together                                                                                                     |
| §4 a self-referential cycle is its own inner failure at build                                | —                                                        | MISSING: not exercised at build (`CycleError` covered at resolution)                                                                                          |
| §4 build validation validates every registration of a multiply-registered address            | —                                                        | MISSING: `validateBuildability()` plans one closed address once (owner question, standard session report)                                                     |
| §4 build validation refuses type mismatches                                                  | —                                                        | MISSING: no reflective type check exists in this runtime                                                                                                      |
| §4 build validation skips a constrained open registration that closes for some arguments     | —                                                        | MISSING: no constrained generics in this runtime                                                                                                              |
| §5 built-ins registered once, in fixed order                                                 | —                                                        | MISSING: not observable black-box                                                                                                                             |
| §5 `IServiceProvider` is the resolving scope's                                               | standard-lifetime.test.ts                                | scopes › the provider resolved inside a scope is that scope's own                                                                                             |
| §5 `IServiceScopeFactory` is the one container-level instance                                | standard-lifetime.test.ts                                | scopes › the scope factory is resolvable from the container and from any scope, always the same instance                                                      |
| §5 `IServiceProviderIsService` / keyed                                                       | —                                                        | MISSING: no such built-in in this runtime (keyed services are §6, out of scope)                                                                               |
| §5 `IsService` semantics                                                                     | —                                                        | MISSING: no such member in this runtime                                                                                                                       |
| §5 no built-in is ever captured                                                              | standard-lifetime-disposal.test.ts                       | the walk › the built-in registrations are never captured …                                                                                                    |
| §7 no parent-scope fallback                                                                  | standard-lifetime.test.ts                                | scoped › a scope opened from inside a scope gets its own instance, independent of the opener                                                                  |
| §7 wide scoped trees                                                                         | standard-lifetime.test.ts                                | scoped › a wide scoped tree resolves: every one of twelve scoped siblings is shared within a scope and fresh in another                                       |
| §7 recompiling a plan leaves cache identity unchanged                                        | —                                                        | MISSING: no recompilation concept in this engine                                                                                                              |
| §7 a transient holding its own provider disposes cleanly                                     | standard-lifetime-disposal.test.ts                       | which scope owns a transient › a transient holding the provider it was resolved from is disposed with its scope, exactly once                                 |
| §7 an invalid constrained open registration skipped in a collection, thrown for a single ask | —                                                        | MISSING: no constrained generics in this runtime                                                                                                              |

### `tagged-lifetime-model.design.md`

| Spec row                                                                                         | Test file                        | Test name                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------ | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Behavior — Builder.build()'s provider caches nothing                                             | tagged-lifetime.test.ts          | the built provider › caches nothing: a tagged registration is fresh on every ask through it                                                                 |
| Behavior — Builder.build()'s provider tracks nothing                                             | tagged-lifetime-disposal.test.ts | what is never captured › a transient resolved from the built provider is not disposed with it                                                               |
| Behavior — a registration whose lifetime is omitted is transient, cached by no scope             | tagged-lifetime.test.ts          | a registration naming no lifetime › omitted, it is transient everywhere: fresh per ask and per injection site, in a scope or out of one                     |
| Behavior — a registration whose lifetime is `undefined` is transient                             | tagged-lifetime.test.ts          | a registration naming no lifetime › spelled undefined, it is the same transient                                                                             |
| Behavior — `openScope(lifetime)` excludes `undefined` at the type level                          | tagged-lifetime.types.ts         | compile-time `@ts-expect-error` checks (no `test()` name; type-level only)                                                                                  |
| Behavior — the factory is the tagged model's own interface, separate from `IServiceScopeFactory` | tagged-lifetime.types.ts         | compile-time: the addon locks the vocabulary on `ITaggedServiceScopeFactory` (type-level only)                                                              |
| Behavior — `openScope(lifetime)` answers a provider that manages the cache for that one lifetime | tagged-lifetime.test.ts          | a scope › caches its own tag: every ask and every injection site within it shares one instance                                                              |
| Behavior — no dictated order in which scopes open                                                | tagged-lifetime.test.ts          | the chain › scopes open in any order: a session scope inside a request scope caches the session tag all the same                                            |
| Behavior — disposing the provider ends the scope                                                 | tagged-lifetime-disposal.test.ts | after disposal › a disposed scope refuses every ask, while its siblings and the built provider go on                                                        |
| Behavior — a factory resolved from a scoped provider opens scopes that chain onto it             | tagged-lifetime.test.ts          | the scope factory › resolved from a scope, it opens scopes chained onto that scope, every time it is resolved there                                         |
| Behavior — every ask is checked by every scope on the chain, descendants first                   | tagged-lifetime.test.ts          | the chain › descendants are checked first: with a scope of another tag between two of one tag, the innermost of that tag answers                            |
| Behavior — a hit anywhere answers the cached instance                                            | tagged-lifetime.test.ts          | the chain › a hit anywhere on the chain answers: a session-tagged ask through a request scope is the session's instance                                     |
| Shape — the addon's middleware is an installer only                                              | —                                | MISSING: internal wiring, not observable black-box                                                                                                          |
| Shape — a scope's middleware caches only its own tag; other tags pass through                    | tagged-lifetime.test.ts          | a scope › passes every other tag through: a registration of another tag is fresh on every ask                                                               |
| Shape — lifetime middlewares stack, one per open scope                                           | tagged-lifetime.test.ts          | the chain › same-tag nesting: the descendant wins, and the ancestor keeps its own                                                                           |
| Shape — each layer records itself on the request, chain in crossing order                        | tagged-lifetime.test.ts          | the chain › descendants are checked first …                                                                                                                 |
| Same-tag nesting — different tags: order never matters                                           | tagged-lifetime.test.ts          | the chain › scopes open in any order …                                                                                                                      |
| Same-tag nesting — the descendant wins                                                           | tagged-lifetime.test.ts          | the chain › same-tag nesting: the descendant wins, and the ancestor keeps its own                                                                           |
| Factory — a normal registration with no lifetime, constructed per resolution                     | tagged-lifetime.test.ts          | the scope factory › is constructed per resolution: two asks answer two factories                                                                            |
| Factory — `afterConstruct` binds it to the provider the ask came from                            | tagged-lifetime.test.ts          | the scope factory › injected, it is bound to the provider the ask came from                                                                                 |
| Factory — a user's own registration of the factory address wins                                  | tagged-lifetime.test.ts          | the scope factory › a user's own registration of the factory address wins                                                                                   |
| Factory — resolved from the built provider, opens scopes beneath no open scope                   | tagged-lifetime.test.ts          | the scope factory › resolved from the built provider, it opens scopes over the built provider, beneath no open scope                                        |
| `IServiceProvider` injected — the provider the ask came from                                     | tagged-lifetime.test.ts          | the provider an ask is handed › injected into a cached node, it is the provider that ask came from, whichever scope caches the node                         |
| `IServiceProvider` resolved from a scope resolves against that scope                             | tagged-lifetime.test.ts          | the provider an ask is handed › resolved from a scope, it resolves against that scope                                                                       |
| State — no layer threads state; tag and chain decide                                             | tagged-lifetime.test.ts          | the chain › the dependencies of a cached node are cached where their own tags say                                                                           |
| State — one entry per closing of an open registration                                            | tagged-lifetime.test.ts          | open registrations › an open registration is cached once per closing                                                                                        |
| State — one entry per registration of an address                                                 | tagged-lifetime.test.ts          | several registrations of one address › two registrations of one address under one tag are two entries of that scope                                         |
| State — the built provider owns no layer                                                         | tagged-lifetime-disposal.test.ts | what is never captured › a transient resolved from the built provider is not disposed with it                                                               |
| Hooks — `beginResolve` answers the chain                                                         | tagged-lifetime.test.ts          | (observed through every chain test; no direct assertion of the hook's return shape — internal)                                                              |
| Hooks — `beforeConstruct` hit answers `{ result }`                                               | tagged-lifetime.test.ts          | the chain › a hit anywhere on the chain answers …                                                                                                           |
| Hooks — `beforeConstruct` miss constructs under the layer carrying the tag                       | tagged-lifetime.test.ts          | the chain › a miss constructs under the scope carrying the tag, wherever on the chain it sits                                                               |
| Hooks — other nodes go to the engine untouched                                                   | tagged-lifetime.test.ts          | a tag with no open scope on the chain › resolves as a transient through the built provider                                                                  |
| Hooks — `afterConstruct` stores then captures a disposable tagged node                           | tagged-lifetime-disposal.test.ts | what is captured › an instance a scope caches is disposed with that scope, and only then                                                                    |
| Hooks — a layer already disposed disposes at once and throws `ObjectDisposedError`               | tagged-lifetime-disposal.test.ts | after disposal › an instance constructed while its scope is disposing is disposed at once and the ask refuses                                               |
| Hooks — a transient node: nothing                                                                | tagged-lifetime-disposal.test.ts | what is never captured › a transient injected into a cached node is not disposed with the scope caching the node                                            |
| Hooks — `canonicalize`, `beforePlan` not used                                                    | —                                | not a behavior (nothing to assert)                                                                                                                          |
| Hooks — a promise is cached as constructed; concurrent asks share it                             | tagged-lifetime.test.ts          | asynchronous constructions › concurrent asks for a pending construction share it                                                                            |
| Hooks — a rejecting promise evicts its entry                                                     | tagged-lifetime.test.ts          | asynchronous constructions › a construction that rejects is forgotten, so the next ask constructs again                                                     |
| Hooks — a settled value is captured on settlement                                                | tagged-lifetime-disposal.test.ts | asynchronous products › a promise product is captured on settlement and disposed with its scope                                                             |
| Hooks — a throwing construction caches nothing                                                   | tagged-lifetime.test.ts          | creation failure › a construction that throws caches nothing, so the next ask constructs again                                                              |
| Disposal — reverse order of capture                                                              | tagged-lifetime-disposal.test.ts | the walk › disposes in reverse order of capture                                                                                                             |
| Disposal — deduplicated by reference                                                             | tagged-lifetime-disposal.test.ts | the walk › one instance captured under several addresses is disposed once, where it was first captured                                                      |
| Disposal — one error rethrown as itself                                                          | tagged-lifetime-disposal.test.ts | errors during disposal › one failure disposes everything else and rethrows the failure itself                                                               |
| Disposal — several errors: `AggregateError`                                                      | tagged-lifetime-disposal.test.ts | errors during disposal › two failures dispose everything else and throw one AggregateError carrying both                                                    |
| Disposal — sync form records an error for an async-only instance                                 | tagged-lifetime-disposal.test.ts | the two forms against the two protocols › the synchronous form counts an instance offering only Symbol.asyncDispose as an error and still disposes the rest |
| Disposal — async form awaits each, calls a sync-only one directly                                | tagged-lifetime-disposal.test.ts | the two forms against the two protocols › the asynchronous form awaits each asynchronous instance and calls a synchronous-only one directly, in order       |
| Disposal — a second dispose is a no-op                                                           | tagged-lifetime-disposal.test.ts | the walk › a second disposal does nothing, in either form                                                                                                   |
| Disposal — a disposed provider refuses with `ObjectDisposedError`                                | tagged-lifetime-disposal.test.ts | after disposal › a disposed scope refuses every ask, while its siblings and the built provider go on                                                        |
| Disposal — every provider beneath a disposed one refuses                                         | tagged-lifetime-disposal.test.ts | after disposal › a scope opened beneath a disposed scope refuses from the start; every scope beneath a disposed scope refuses with it                       |
| Disposal — the built provider holds nothing of its own                                           | tagged-lifetime-disposal.test.ts | after disposal › disposing the built provider leaves what an open scope owns to that scope                                                                  |
| Disposal — the head refuses every ask afterwards, ending every scope's resolutions               | tagged-lifetime-disposal.test.ts | after disposal › disposing the built provider ends every scope's resolutions                                                                                |
| A tag with no open scope resolves as a transient, never captured                                 | tagged-lifetime-disposal.test.ts | what is never captured › a tagged instance reached where no scope carries its tag is not disposed by anyone                                                 |

### `phase2-request-door.design.md`

| Spec row                                                                                                                                                                                                                                                            | Test file                   | Test name                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request.activate "records `handle` as active for this ask and answers the same request — written `next(request.activate(handle))`"                                                                                                                                  | installed-hooks.test.ts     | staged vs installed hooks > an ask through one layer never runs a parallel layer's staged hooks                                                                                                 |
| ServiceRequest "An ask a provider opened" / `serviceProvider` lives on `ServiceRequest` only                                                                                                                                                                        | engine-request-door.test.ts | the request as an address > a factory slot naming ServiceRequest receives the ask's own request                                                                                                 |
| "Requests are minted in exactly two places": `ServiceProvider.getService` mints `new ServiceRequest(address, this)`                                                                                                                                                 | engine-request-door.test.ts | the request as an address > a factory slot naming ServiceRequest receives the ask's own request                                                                                                 |
| "Requests are minted in exactly two places": a middleware's fold-time control ask mints `next(new ControlRequest(typefor<ControlService>()))`                                                                                                                       | MISSING                     | no test shows a middleware itself minting a ControlRequest at fold time — all tests construct `new ControlRequest(...)` directly                                                                |
| `ControlService.registry` "the engine's own two rows carry a `null` lifetime" (also NOT hidden from the registry)                                                                                                                                                   | engine-request-door.test.ts | the seeded registrations > the two seeded rows are visible through the control registry and carry a null lifetime                                                                               |
| `stageHooks`: "Installs `hooks` gated: they run only for an ask that activated the handle"                                                                                                                                                                          | installed-hooks.test.ts     | staged vs installed hooks > an ask through one layer never runs a parallel layer's staged hooks                                                                                                 |
| `installHooks`: "Installs `hooks` always active: they run for every ask, outermost"                                                                                                                                                                                 | installed-hooks.test.ts     | staged vs installed hooks > installed hooks run for every ask, outermost, ahead of the staged layer                                                                                             |
| "There is no `uninstall` verb anywhere — disposing the handle is the uninstall" (staged handle)                                                                                                                                                                     | installed-hooks.test.ts     | staged vs installed hooks > disposing a handle uninstalls: a request still naming it fails its gate                                                                                             |
| "There is no `uninstall` verb anywhere — disposing the handle is the uninstall" (installed handle)                                                                                                                                                                  | installed-hooks.test.ts     | staged vs installed hooks > disposing an installed handle stops it running for later asks                                                                                                       |
| "`Hooks.Construction.registration` drops its `?`: hooks fire only at registration-carrying nodes"                                                                                                                                                                   | installed-hooks.test.ts     | where construction hooks fire > never at an engine-synthesised node — only the registered node beneath it                                                                                       |
| "There are no helper functions for the fold-time control asks: each caller spells the ask, the control guard, and ... `new Registry(control.registry)` inline. The two validation addons do exactly that"                                                           | MISSING                     | only asserted (if at all) in validation-addon.test.ts, which is not in the reviewed file set                                                                                                    |
| Seeds: "The `Engine` constructor appends exactly two registrations AFTER the given ones, so they file OLDEST and a user registration at the same address shadows them"                                                                                              | engine-request-door.test.ts | the seeded registrations > a user registration at IServiceProvider shadows the seed                                                                                                             |
| "The engine also keeps the two rows in an identity set (`Engine.isSeeded`)... a user registration that happens to carry a `null` lifetime is not the engine's, and hooks fire at and beneath it"                                                                    | installed-hooks.test.ts     | where construction hooks fire > a user registration carrying a null lifetime is not the engine's — hooks still fire at and beneath it                                                           |
| "The provider factory mints a fresh provider wrap per handout, forwarding every ask to the minting request's provider — provider identity is never a contract, and the handed-out view is never the container object"                                               | engine-request-door.test.ts | the seeded registrations > resolving IServiceProvider answers a fresh view forwarding to the asking provider                                                                                    |
| "Seeded registrations plan their slots like any other: the provider seed's `ServiceRequest` slot lowers through `lowerArg` to a `RequestPlan`"                                                                                                                      | MISSING                     | no test directly inspects the seed's own plan node/kind (`RequestPlan`) — only its externally observed behavior                                                                                 |
| "The request is NOT registered"                                                                                                                                                                                                                                     | engine-request-door.test.ts | the request as an address › the request is not registered: a user registration at a request address still answers first                                                                         |
| "`PlannerVisitor.visitImported` answers the three request addresses with `Plan.request(type)`"                                                                                                                                                                      | engine-request-door.test.ts | the request as an address > a factory slot naming ServiceRequest receives the ask's own request                                                                                                 |
| "— synthesis, so a user registration at one of those addresses still answers first"                                                                                                                                                                                 | engine-request-door.test.ts | the request as an address › the request is not registered: a user registration at a request address still answers first                                                                         |
| RealizeVisitor "answers the request in flight when it is an instance of the asked arm — the base class answers any — and otherwise throws `UnsatisfiableError`"                                                                                                     | engine-request-door.test.ts | the request as an address > a ServiceRequest slot under a control ask refuses; a base Request slot answers either arm                                                                           |
| "No sentinel value, no per-ask registry: addresses are fixed at build, only the answer arrives per ask, so `Plan.from`'s per-registry memo never invalidates"                                                                                                       | MISSING                     | memo-invalidation across asks is not asserted by any reviewed test (would belong to plan-cache.test.ts, not reviewed)                                                                           |
| Shadowing: "A registration whose own slot names its own address ... gets the SHADOWED (older) registration as that dependency: matching for a self-named slot starts after the registration being planned"                                                          | engine-request-door.test.ts | shadowing resolves beneath > a Func<[Foo], Foo> factory receives the shadowed older registration                                                                                                |
| "No older match is unsatisfiable (throws, never delegates)"                                                                                                                                                                                                         | engine-request-door.test.ts | shadowing resolves beneath > a self-named slot with nothing older throws instead of delegating                                                                                                  |
| "A collection ask still enumerates every match, decorator and shadowed both"                                                                                                                                                                                        | engine-request-door.test.ts | shadowing resolves beneath > a collection ask still enumerates decorator and shadowed both, in authored order                                                                                   |
| "The cycle guard still catches real cycles through a third address"                                                                                                                                                                                                 | engine-request-door.test.ts | shadowing resolves beneath > a real cycle through a second address still throws CycleError                                                                                                      |
| Mechanics: nesting through repeated self-named decoration "terminates because the position strictly grows"                                                                                                                                                          | engine-request-door.test.ts | shadowing resolves beneath > stacked decorators each resolve the one beneath                                                                                                                    |
| `Engine.getService` "keeps only the `TypeError` guard"                                                                                                                                                                                                              | MISSING                     | no reviewed test exercises the engine's TypeError guard                                                                                                                                         |
| `Engine.getService` "delegate to `next` when no registration matches (`!registry.hasMatch`)"                                                                                                                                                                        | engine-delegation.test.ts   | what flows through next > an unregistered ask delegates once, same request, answer returned verbatim                                                                                            |
| `Engine.getService` "else `Plan.realize`" (registered answered in place; unbuildable throws instead of delegating)                                                                                                                                                  | engine-delegation.test.ts   | what the engine answers itself > a registered ask is answered in place; nothing reaches next; registered but unbuildable throws instead of delegating                                           |
| Dispatch 1: "Root suppression: a `registered-ctor`/`-factory`/`-promise` root whose registration is one of the engine's two seeded rows (by identity) opens no dispatch — no `beginResolve`, no arrays"                                                             | installed-hooks.test.ts     | where construction hooks fire > never at a seeded node, even inside a hooked ask                                                                                                                |
| Dispatch 2: "Snapshot `always = installed.always` (an install during the ask builds a new object; this ask keeps its own)"                                                                                                                                          | MISSING                     | no test installs hooks mid-ask to prove the running ask keeps its own snapshot                                                                                                                  |
| Dispatch 3: "`always.count === 0 && active.length === 0`: plain `visit` — the no-hooks path allocates nothing beyond it"                                                                                                                                            | MISSING                     | the no-hook fast path / allocation-free claim is not asserted by any reviewed test                                                                                                              |
| Dispatch 4: "`states = new Array(always.count + active.length)`; one `beginResolve` pass fills it — the always entries first ..., then `active` by position"                                                                                                        | installed-hooks.test.ts     | staged vs installed hooks > installed hooks run for every ask, outermost, ahead of the staged layer; where construction hooks fire > beginResolve's answer arrives as each construction's state |
| Dispatch 5: "When no construction-kind hook participates in the ask ... the walk runs without `states` on the context, so every node takes the plain path and no hook can observe the difference"                                                                   | MISSING                     | no test isolates a beginResolve-only install to show the states-less walk path                                                                                                                  |
| Gate check: "an emptied slot is skipped"                                                                                                                                                                                                                            | installed-hooks.test.ts     | staged vs installed hooks > disposing a handle uninstalls: a request still naming it fails its gate                                                                                             |
| Gate check: "an `installHooks` handle is not staged and already ran in the always set, so it is skipped too"                                                                                                                                                        | MISSING                     | no test activates an installHooks handle's own slot to confirm it is not run twice                                                                                                              |
| Gate check: "a handle whose entry lacks the kind is skipped"                                                                                                                                                                                                        | MISSING                     | no test asserts a handle lacking a given hook kind is silently skipped for that kind                                                                                                            |
| "Walk order per kind: the always entries in install order, then `active` in activation order; a middleware-form hook's `next` stands for everything later in that order, so trailing-`next` hooks nest in activation order"                                         | installed-hooks.test.ts     | staged vs installed hooks > installed hooks run for every ask, outermost, ahead of the staged layer                                                                                             |
| "`beginResolve`: at the door, once per realize entry (`getService`, `resolveFrame`, `resolveLatebound` each open one)"                                                                                                                                              | installed-hooks.test.ts     | where construction hooks fire > beginResolve's answer arrives as each construction's state                                                                                                      |
| "`beforeConstruct`: at `visitRegisteredCtor`/`Factory`/`Promise` only, and never at one of the engine's seeded rows"                                                                                                                                                | installed-hooks.test.ts     | where construction hooks fire > never at a seeded node, even inside a hooked ask                                                                                                                |
| "`{ result }` stands for the construction — args unrealized, `canonicalize`/`afterConstruct` skipped, later layers never run"                                                                                                                                       | installed-hooks.test.ts     | where construction hooks fire > afterConstruct is skipped when beforeConstruct answered a result                                                                                                |
| "`{ state }` redirects that behavior's slot for the subtree"                                                                                                                                                                                                        | installed-hooks.test.ts     | where construction hooks fire > beginResolve's answer arrives as each construction's state                                                                                                      |
| "construct: the node's call under the (possibly redirected) states"                                                                                                                                                                                                 | MISSING                     | no test isolates that the actual construction call runs under a redirected state (only that later hooks observe it)                                                                             |
| "`canonicalize`: reverse walk, so the outermost proxy ends outermost; only where the engine built"                                                                                                                                                                  | MISSING                     | no reviewed test exercises the `canonicalize` hook at all                                                                                                                                       |
| "`afterConstruct`: same reverse order; skipped when a `beforeConstruct` answered a result — 'after' means after a construction happened"                                                                                                                            | installed-hooks.test.ts     | where construction hooks fire > afterConstruct is skipped when beforeConstruct answered a result                                                                                                |
| "Hooks fire ONLY at registration-carrying nodes, never at engine-synthesised ones"                                                                                                                                                                                  | installed-hooks.test.ts     | where construction hooks fire > never at an engine-synthesised node — only the registered node beneath it                                                                                       |
| "The consumer a hook sees is the NEAREST REGISTERED ANCESTOR — synthesised glue is skipped, so a singleton consuming a tuple holding another registered service is the consumer of that service"                                                                    | installed-hooks.test.ts     | where construction hooks fire › the consumer a construction sees is the nearest registered ancestor: a collection node between them is skipped                                                  |
| `Hooks.Construction`: "`populatedAddress` ... from the plan"                                                                                                                                                                                                        | installed-hooks.test.ts     | where construction hooks fire > beginResolve's answer arrives as each construction's state (also every `watching` helper)                                                                       |
| `Hooks.Construction`: "`registration` from the plan"                                                                                                                                                                                                                | MISSING                     | no reviewed test reads `construction.registration`                                                                                                                                              |
| `Hooks.Construction`: "`node` = the plan node (stable, opaque)"                                                                                                                                                                                                     | MISSING                     | no reviewed test reads or asserts `construction.node`                                                                                                                                           |
| `Hooks.Construction`: "`state = states[i]` — one carrier per participating behavior per hooked node"                                                                                                                                                                | installed-hooks.test.ts     | where construction hooks fire > beginResolve's answer arrives as each construction's state                                                                                                      |
| "Arity: read once at install; dispatch reads a boolean"                                                                                                                                                                                                             | MISSING                     | no test isolates arity being fixed at install time vs. re-derived on each dispatch                                                                                                              |
| "The chain never seals: a scope factory wraps a new layer over the folded chain at any time, and hooks install at any time"                                                                                                                                         | installed-hooks.test.ts     | staged vs installed hooks › the chain never seals: hooks installed after asks have run fire for the next ask                                                                                    |
| "Fork guarantee: the only gated source is `request['active']` ... a sibling wrap over the same folded chain pushed nothing onto it, so an ask through one never runs the other's staged hooks, while installed hooks run for both, outermost"                       | installed-hooks.test.ts     | staged vs installed hooks > an ask through one layer never runs a parallel layer's staged hooks; installed hooks run for every ask, outermost, ahead of the staged layer                        |
| "Latebound guarantee: `visitLateBound`/`visitInvoker` close over the minting request; re-entry through `resolveLatebound`/`resolveFrame` reaches the door with THAT request and reads its activation list ... under the always set as installed at invocation time" | installed-hooks.test.ts     | staged vs installed hooks > a latebound minted inside a layer and invoked later still runs that layer's hooks                                                                                   |
| "Allocations per ask: no hooks — none beyond the door's two length reads and one root check. With hooks — `states`, the derived context, and per hooked node one carrier per participating behavior plus one `next` closure per middleware-form hook called"        | MISSING                     | allocation counts are never asserted by any reviewed test                                                                                                                                       |
| Delegation: "No registration → `next`; registered but unbuildable → throw"                                                                                                                                                                                          | engine-delegation.test.ts   | what flows through next > an unregistered ask delegates once, same request, answer returned verbatim; what the engine answers itself > registered but unbuildable throws instead of delegating  |
| "Beneath the engine only the terminus stands"                                                                                                                                                                                                                       | engine-delegation.test.ts   | the chain terminus > a built provider refuses an unregistered ask with the terminus reason                                                                                                      |
| Tests section: "The example app under `examples/` resolves again"                                                                                                                                                                                                   | MISSING                     | out of scope of the reviewed test files (concerns the `examples/` app, not `tests/di.test`)                                                                                                     |

## Session — Type spells itself (§234), 2026-09-03

- [x] Owner ruled §234 (`docs/decisions.v2.md`): prototype `toString`/`toStringTag`/inspect hook, no `toJSON`, `Type.reviver`, unqualified `kind`.
- [x] Implemented in place: `b7bd72bd` (prototype, `Type.reviver` + `isRawType`, tests, docs), `3c90071d` (`${type}` at the call sites). Build/test/lint/format green; pushed.

## Session — the Go engine as a published package, 2026-09-03

Finding: a published `*.extras` cannot run its transforms. `ttsc` builds Go SOURCE on the consumer's machine (its own bundled Go SDK; it accepts no prebuilt binary), and nothing publishes `transforms/` — each extras' `ttsc.mjs` resolves `../../transforms/cmd/ttsc-std`, which in `node_modules` is nowhere. Gates the publish flip.

Design (discussed, not yet ruled):
- Publish `transforms/` (`cmd/`, `internal/`, `go.mod`, `go.sum`; never `go.work`) as one npm package; every `*.extras` takes it as a runtime `dependency` (`workspace:^` in-repo).
- The `ttsc.plugin.transform` marker stays in every extras' `package.json`: `ttsc` reads only the consumer's DIRECT dependencies' manifests.
- Descriptor location: stock `ttsc` resolves a bare `transform` specifier from the CONSUMER root (`require.resolve(spec, { paths: [projectRoot] })`), so a marker naming the transforms package fails under isolated linkers (this repo's own bunfig). `exports` cannot target another package; `imports` (`#`) is package-private. Options: (a) upstream `ttsc` to resolve from the marker package's root first, one line, recommended; (b) bridge: one-line `ttsc.mjs` per extras re-exporting the shared descriptor; (c) both — bridge now, drop it when (a) ships.

Open, owner's word: the package name (directory is `transforms`); option (a)/(b)/(c). Consequence: a new published name needs its npm placeholder + trusted-publisher binding like the other 32.
