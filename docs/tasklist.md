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
      `validateStandardCaptivity` middleware; `standard({ validateScopes, validateOnBuild })`,
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
      surfaced as a public hosting API removal. If hosting ever composes on `standard()`, the
      reference's two flags map 1:1 onto `standard({ validateScopes, validateOnBuild })`.

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
      shorter-lived dependency) without asserting which tier. `ResolveAudit` placeholder wording
      (90c77ff3): named the real cause (this container never installed the addon's hooks) and the
      fix (`useAddon(resolveAudit())`) plainly, dropping the "filing this registration by hand"
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
- [ ] Bench re-run — DROPPED (owner-ruled 2026-08-30): no bench package or script exists anywhere
      in the repo or its git history; no substitute attempted.
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
| `iterable(() => this.#enclosing().drop(1))` (`@rhombus-toolkit/obj`)                                                                          | hand-built `{ [Symbol.iterator]: () => ... }` object literal — `libraries/di/src/addons/resolve-audit.ts:35`                                                 |
| `this.#enclosing().find(isDefined)`                                                                                                           | `this.#enclosing().next().value` — `libraries/di/src/addons/resolve-audit.ts:31`                                                                             |
| `iterable(() => Iterator.from(plan.types).map(inner => self.visit(inner, context)))` (`@rhombus-toolkit/obj`)                                 | hand-built `{ *[Symbol.iterator]() { ... } }` object literal — `libraries/di/src/internal/Plan/RealizeVisitor.ts:191`                                        |
| `!this.#registry.getMatches(promised).some(isDefined)`                                                                                        | `.getMatches(promised).next().done` emptiness probe — `libraries/di/src/internal/Plan/PlannerVisitor.ts:112`                                                 |
| `registry.getMatches(address).some(isDefined)`                                                                                                | `!registry.getMatches(address).next().done` emptiness probe — `libraries/di/src/internal/Plan/Plan.ts:271`                                                   |
| `isCtorRegistration(left)` / `isFactoryRegistration(left)` / `isValueRegistration(left)` — this module's own guards, already used by `kind()` | `'ctor' in left` / `'factory' in left` / `'value' in left` hand-rolled branches in `equals()` — `libraries/di.core/src/Registration/op.ts:40`                |
| `typefor<ResolveAudit>()` inline at each use site                                                                                             | hoisted local `const address = typefor<ResolveAudit>()` — `libraries/di/src/addons/resolve-audit.ts:86`                                                      |
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
