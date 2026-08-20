# Tasklist

Open work items. An item lands here when it is decided but not yet done; it leaves when the change is in.
Architectural rulings belong in `decisions.user.md` (gospel) or `decisions.v2.md` — this file tracks execution only.

## Execution run — 2026-08-19, 22:05

This doc is executed on that date. Everything needed to run it unattended is written here; nothing depends on a
conversation the session cannot read.

**Entry point: `/go`.** All coding work starts through it — not a bare dispatch. The orchestrator runs LOCALLY, on
Fable at `xhigh` effort, started with `fnc` by the `std-tasklist-run.timer` user unit into a detached tmux session
named `std-tasklist` (attach with `tmux attach -t std-tasklist` to watch or intervene), with
`--dangerously-skip-permissions` since nobody is at the keyboard.

**When `/go`'s `/ready` gate reports gaps, fix and retry — under two limits.** A gap that is OBVIOUS is auto-fixed
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

**First action of the run — lift the in-flight work off this branch.** The uncommitted repattern was committed
whole as a savepoint at **`3a958efa`** (parent **`6351145f`**, the last docs-only revision; also on origin as
`wip-274-savepoint`, so the work survives the rollback no matter what). Before anything else:

0. **If the working tree is dirty, commit it first** — another `--no-verify` savepoint on top of the tip. Step 2
   is a `--hard` reset and would destroy anything uncommitted. Nothing is triaged, reviewed, or discarded here;
   whatever is in the tree at 22:05 is part of the work being lifted.
1. `git worktree add ../std@fnioc+<name> -b <feat-branch> <current tip of IServiceManifest-repair>` — the tip, not
   `3a958efa` literally, so everything committed between 2026-08-16 and the run comes along. Branch named for the
   work (`feat-…`/`fix-…`), never `agent-<id>`.
2. `git reset --hard 6351145f` on `IServiceManifest-repair` — UNDO the commits, do not `git revert` them. No new
   commit rewrites the old state; the branch's history simply no longer contains it. `origin/IServiceManifest-repair`
   is at `6351145f` today, so this needs no force-push — unless someone pushed past it in the interim, in which
   case force-push.

Pushing is authorized throughout — the worktree branch as work lands on it (which is also what feeds the cloud
workers), and `IServiceManifest-repair` after the reset, force-pushed if the remote has moved past the floor.

The run then works IN that worktree. The savepoint's work and the run's own work return together as a PR into
`IServiceManifest-repair`, which is how "merge into #274" happens — through the PR, not a direct merge. Changes
the run is unsure about still go to their OWN separate worktrees, unmerged and un-PR'd, reported by branch name.

This procedure was written ABOVE the savepoint, so `6351145f` carries an older copy of this file. After the reset,
the authoritative tasklist is the WORKTREE's — do not re-read the main checkout's copy and conclude anything went
missing.

The savepoint does not build or even format — it was committed with `--no-verify`. One known break:
`tests/diagnostics.test/test/listener-config-factory.test.ts:75` has a stray `Manifest<any>` pasted ahead of a
`let manifest: Manifest = new DefaultManifest();`. Others are expected; finding and fixing them is the job.

**Order.** Apply every requirement in this doc, then work through whatever build errors remain.

Permitted with no discussion:

- typos;
- code that was never converted to the patterns this doc describes.

Not permitted:

- design decisions;
- code that does not comply with a pattern already established here or in the codebase.

Those two lists are the INTENT, not an exhaustive catalogue of what will come up. Where a situation is not covered,
read for the intent — the owner is not available to arbitrate mid-run, and a change that needs arbitration is by
definition one of the two forbidden kinds.

**Where the work lands.** Everything that satisfies the rules above merges into `IServiceManifest-repair` (PR
#274). A change the run is fairly confident about but cannot guarantee against those rules stays in an UNMERGED
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
  (`serviceType`, `ServiceType`, no "token") so the L4 rename sweep never has to touch its output.
- **L2 — Go engine (parallel).** transforms/: aliased-union naming with the exportedness gate, AliasType
  derivation + node + factory (the primitives/Type.ts edits ride here — different files from L1),
  `Hole`→`Generic` rename, mergesynth ctor/func split. Parity e2es updated per change. Touches L1 only at the
  parity suites — integrate freely.
- **L3 — options family (prep now, core gated).** Immediately: the extras dep edges, the addOptions face fix,
  hosting's tsconfig.ci.json fix. The sentinel-slot rewrite + Keyed acceptance start the moment L1(3) and L2's
  Keyed derivation land — do not wait for L1 to finish entirely.
- **L4 — mechanical sweeps (parallel, file-scoped agents).** getOrInsert swap, groupBy, lazy-thrown strings,
  assertNever style, iterable `replace` overloads, smoke.ts audit/port, `configureContainer` degeneralization,
  errors-demo reimplementation, and the token→type + serviceType renames over every file OUTSIDE L1's blast
  radius (di.core/src/builder.ts, ServiceProvider.ts, the descriptor augmentation files). After L1 lands, one
  cheap re-sweep over its files for any straggler naming.
- **L5 — exports rework (parallel worktree).** The conventional-exports overhaul + the feat-src-first-exports
  salvage-check-and-delete. Its conflicts with other lanes are package.json/tsconfig JSON — easy merges,
  tolerated. Integrates LAST before the final gate so resolution-behavior changes are verified once, not per
  lane.
- **L6 — integrate & finish (serial tail).** Merge lanes as they complete; full gate; the comment sweep over
  the final diff (pure churn — never runs concurrently with code lanes); commit relabeling; milestone commit;
  PR into `IServiceManifest-repair`; only then the async/scope gate check.

Cloud workers carry gate runs and any lane whose file set is disjoint from the local tree state, per the
remote-worker rules above.

## Finish converting `Type | string` away (U6)

A parameter that names a type takes a `Type` and nothing else; a consumer holding a string writes `Type.from(...)`
at the call. Most sites are already converted by hand. What remains:

- [ ] `libraries/di.core/src/builder.ts` — `withSignature` / `withSignatures` parameter rows and the `signatures`
      state member (`:46`, `:54`, `:90`, `:145`, `:149`), plus the commented `describe` at `:256`. These disappear
      entirely if the door-collapse item below lands first, so sequence that one ahead of this.
- [ ] `libraries/di/src/ServiceProvider.ts` — `getService` and the resolve family (`:34`, `:53`, `:90`, `:100`).
- [ ] `libraries/primitives/src/augmentation/registry.ts` — `registerAugmentations`, `augment`, and the
      `receiverType` normalizer they share (`:57`, `:87`, `:119`); the normalizer goes with them.
- [ ] `libraries/logging.config/` — `ILoggerProviderConfigFactory.getConfig`, `LoggerProviderConfigFactory`
      `getConfig`, and `registerProviderOptions`'s two parameters.
- [ ] Re-sweep for `Type | string` and `string | Type` afterwards.
- [ ] **Rename the "token" word away wherever the thing is a `Type`.** `token: Type` → `type: Type`,
      `huzzaToken` → `huzzaType`, and every other identifier/parameter spelled `*token*` whose value is a `Type`
      node — in names, and in the doc comments that call it a token. Sweep repo-wide alongside the union sweep.
- [ ] **A parameter naming the SERVICE type is spelled `serviceType`, not `type`.** Owner exemplar: every
      registration-verb face in `libraries/di.core/src/augmentations/Manifest-Descriptor-augmentations.ts:20`-`:36`
      (`add`/`tryAdd`/`replace`/`removeAll`) renames its first parameter `type: Type` → `serviceType: Type`.
      Take the intent project-wide — di, di.core, di.extras, and anywhere else a parameter holds the service's
      type: faces, namespace bodies, and the doc comments that call it "type". Parameters naming something else
      (an implementer's type, a constraint) keep their own descriptive names. Same intent at the type level: a
      GENERIC parameter that is precisely the service type is named `ServiceType`, not `T` — e.g.
      `add<ServiceType>(…)` lowering to `add(typefor<ServiceType>(), …)`; a type parameter meaning something
      else keeps its own name.

**Exempt — leave alone:** `libraries/primitives/src/Type/Type.ts` `:163` (`Signatures.from`) and `:266`. These
are the `from`-family boundary converters — the data-input surfaces where a string is legitimately accepted and
turned into a node — so they keep their string legs. The re-sweep must not flag them.

## Kill the sentinel slots

`libraries/options.augmentations/src/option-types.ts` fabricates global type names and registers values under them
that have no relationship to the name. `add(startupValidationTargetType(), optionsAddressType(type))` declares a
service type nothing in the program is ever of, and stores a `Type` node under it. Every one of these is a bucket
key wearing a type's clothes, with `[optionsType]` standing in for a composite key component rather than a type
argument.

- [ ] `configureStepType` → the real type is `IConfigureOptions`, distinct per options type:
      `Type.imported('IConfigureOptions', '@rhombus-std/options', [optionsType])`.
- [ ] `postConfigureStepType` → `IPostConfigureOptions<T>`, same shape.
- [ ] `validateStepType` → `IValidateOptions<T>`, same shape.
- [ ] `changeTokenSourceType` → the change-token source type, same shape.
- [ ] `baseFactoryType` → a `Type.func` — it holds a `() => T`. While there:
      `libraries/options.augmentations/src/DefaultManifest-Options-augmentations.ts:82` registers `makeBase`
      through the two-argument `add(type, value)` — a VALUE descriptor holding the function, not a factory
      descriptor — while the no-`makeBase` branch right below registers a factory. Ensure the value-vs-factory
      choice at `:82` is intentional; if not, fix it to match the intended descriptor kind. Related call site:
      `libraries/logging.config/src/LoggingBuilder-Config-augmentations.ts:62` wants to call
      `addOptions(optionsType, () => new LoggerFilterOptions())` — the two-argument `makeBase` form — but the
      declared `addOptions` surface only admits it with a redundant explicit type argument. Either a sugar/face
      for the two-argument token form is missing, or the `makeBase` path was intended to register a FACTORY and
      is missing its implementer-`Type` argument. Resolve consistently with the `:82` decision. And question the
      slot's whole shape while rewriting it: a call site handing over `() => new LoggerFilterOptions()` is a
      class registration wearing a lambda — the base slot forcing a `() => T` where an ordinary class
      registration of the options type would do is part of the bizarro shape this rewrite should dissolve, not
      preserve.
- [ ] `startupValidationTargetType` → the genuine keyed case: a flat list of `Type` values with no per-element type
      to key on. Spell it `Keyed<Type, K>` rather than a fabricated global.
- [ ] **Any package-qualified name that survives moves from `Type.global` to `Type.imported`.** A global names the
      ambient scope and has no `from` member; string-concatenating a package specifier into a global name is doing
      that member's job by hand.
- [ ] Sweep the other families for the same pattern — `option-types.ts` is where it was found, not necessarily the
      only place it lives.

## Authoring surface

- [ ] **Prefer inline `typefor<T>()` calls over `COMMON_EXPORTED_TYPES`-style shared Type consts.** With the
      hoisted `typefor` emit (the default), every inline call renders as a reference to the one hoisted const
      anyway, so pre-hoisting types into an exported const bag buys nothing — it only adds an indirection the
      reader has to chase. Refactor all such sites to spell `typefor<T>()` inline.

- [ ] **Prefer the type-argument sugar over the explicit token form wherever a sugar exists.** `add<T>(impl)`
      over `add(typefor<T>(), impl)`, `addOptions<T>()` over `addOptions(typefor<T>())`, and the same for every
      other member carrying an inline entry (`tryAdd`/`replace` family, `getService` family, etc.). Refactor all
      first-party call sites. The token form stays the primitive the sugar lowers to — this is a call-site style
      rule, not a surface change. Owner ruling 2026-08-19, the general form: **within the repo, prefer sugar
      usage wherever possible AND clean** — where a library's src wants a sugar face, taking the `*.extras`
      dependency that puts it in scope (and makes the package ttsc-lowered) is authorized and preferred over
      spelling token forms. Specifically authorized dep edges, partially done by the owner already:
      `options.augmentations` → `di.extras`, and `di.extras.options` → `options.augmentations` (for the
      `addOptions(type)` token face its inline body calls). Both are acyclic; the config.extras precedent is the
      mechanism. "Clean" is the limit: where sugar would contort a site (or the dep would create a cycle), the
      token form stays. Acceptance bar for each new edge: the package stages through ttsc so its dist ships
      lowered, and the extras' `declare module` faces stay OUT of its rolled `.d.ts` (extras external in the dts
      roll) — a no-transform consumer must never see sugar it can't run.

- [ ] **Accept `Keyed<T, K>` in the pipeline verbs' `type` position.** The derivation already supports it:
      `DeriveTyped` checks the `Keyed` brand ahead of construct/call signatures and emits a `tag` node over the
      stripped base (`transforms/internal/tokens/derived.go:49-65`), so `typefor<Keyed<T, 'k'>>()` is equivalent to
      `Type.tag(typefor<T>(), 'k')`. What is missing is the verbs accepting and threading it.

- [ ] **Collapse the type door into the implementer door.** The chain currently names the implementer and its type
      in two steps, and `withSignature(...paramTypes)` can only spell parameter rows
      (`libraries/di.core/src/builder.ts:145`) — no `return` after `asFactory`, no `instance` after `asClass`,
      which is why the errors at `:200`/`:220` can only point at `withType`. Make each door take both:

      ```ts
      asClass(ctor: Ctor, ctorType: ConstructorType): …      // primitive
      asFactory(fn: Func, fnType: FunctionType): …
      ```

      and give each a one-argument-shorter sugar in `di.extras` that derives the type:

      ```ts
      asClass<T extends Ctor>(this: …, ctor: T): … {
        return this.asClass(ctor, typefor<T>());
      }
      ```

      This removes `withType` / `withSignature` / `withSignatures`, the `Slots`/`Ready` tracking for the type slot,
      the one-of-three-doors invariant, and the runtime guard at `:126` that polices it. A whole node is written
      with the structured factory forms, which is what they are for.

      The sugar is always **exactly one argument shorter** than the primitive it lowers to. That is what makes it
      terminate: the emitted call resolves to a different overload, so the fixed-point loop cannot re-enter it.
      Adopt this as the general rule for type-taking primitives — `add(type, impl, implType)` gets `add<T>(impl)`
      by the same shape — so termination is stated rather than incidental.

- [ ] **Give `ValueServiceDescriptor` an implementer-type argument, and thread it up the chain.** A value
      registration then lowers to `add(type, value, valueType)` — the same three-argument shape as the ctor and
      factory forms, with the implementer type's kind selecting between them. One sugar body serves all three:

      ```ts
      add<T>(this: Manifest, implementer: unknown, ...rest: any[]): Manifest {
        return this.add.apply(this, [typefor<T>(), implementer, typefor(implementer), ...rest] as any);
      }
      ```

      This is what lets the flat verbs derive the implementer type without the author writing it, and it keeps one
      body per member name per package. The argument is always the same constant for a value — see the `ConstantType`
      item below, which is what makes the three-argument shape total rather than lossy for callables.

### Land the uniform `add` — descriptors as values, implementer type observed

The verbs converge on one shape: the author names the SERVICE type and hands over the implementer; the implementer
TYPE is observed from it. Every `add` door then shares one sugar body, and the only thing choosing ctor vs factory
vs value is the kind of the observed type. Sequence this after the two items above — the value descriptor's
implementer-type argument is what makes the three doors uniform, and the type-door collapse reshapes the very
chain step 2 exposes.

- [ ] **Drop the `add(configure)` lambda overload.** It is the one `add` shape whose second argument is not an
      implementer, so `typefor(value)` would observe the CALLBACK and derive a factory type for it — the single
      thing preventing a uniform body. `IComplete` stops being a marker on a callback's return and becomes
      ordinary assignability at the argument position.
- [ ] **The builder opens at `manifest.describe<TService>()`.** Its terminal is a `ServiceDescriptor`, handed to
      the descriptor-taking primitive that already exists, so descriptors are first-class: built in a helper, held
      in a variable, iterated. Coming off the manifest, the chain stays `ServiceDescriptorBuilderFor<T, Scopes>`
      and scope names keep their checking with nothing threaded. The commented-out free `describe` at
      `libraries/di.core/src/builder.ts:255`-`:261` is this member — moved onto the receiver, opening a chain
      rather than taking a configure callback, and taking a `Type` rather than `Type | string`.

      The cost, accepted: a library cannot author a descriptor at module scope, because it has no manifest in
      hand. A library exports a function taking the manifest instead, which is the existing convention anyway.

- [ ] **Make `describe` an inlinable over a `describe(type: Type)` primitive.** It splits like every other verb —
      the token-taking primitive on `di.core`, the type-argument form as a `rhombus-std` marker `inline` entry in
      `di.extras` lowering `describe<T>()` to `describe(typefor<T>())`. It is the first marker entry the builder
      chain carries: the chain's other members (`asClass`/`asFactory`/`asValue`/`withLifetime`/`taggedAs`) have
      none today, so the entry list and the barrel's re-export graph both grow a first builder-side member.
- [ ] **Collapse the faces to `add<T>(implementer, scope?)`.** With the implementer type observed, no caller
      writes `ctorType`/`factoryType`. `libraries/di.extras/src/augmentations/Manifest-Descriptor-augmentations.ts`
      has this done for `add` (`:8`-`:10`) and not for `tryAdd`/`replace` (`:14`, `:15`, `:18`, `:19`), whose faces
      still take the type argument their bodies never pass.
- [ ] **The value door is `addValue`, and its implementer type is a bare `ConstantType` marker.** A callable
      registered AS a value derives a `FunctionType` exactly like a factory does, so the kind is not recoverable
      from the node — and comparing the service type against the implementer's return does not rescue it: a
      factory returning a concrete (`makeHuzza(): Huzza` under `add<IHuzza>`) fails the equality, and a named
      callable alias fails the other branch, since `typefor<Comparator>()` NAMES while `typefor(value)` OBSERVES.
      Something has to carry the kind, and the call site is what knows it.

      `ConstantType` wraps nothing: a value registration has no signature to read, no injection list, and nothing to
      call, and the `value: T` face already checked assignability where nodes could not. It is a marker with only
      its kind, and the implementer slot becomes a three-way union in `di.core` —
      `ConstructorType | FunctionType | ConstantType` — so kind selection is a total switch with no equality tests.

      ```ts
      addValue<T>(v)  →  add(typefor<T>(), v, ConstantType)      // one derived node, one constant
      add<T>(ctor)    →  add(typefor<T>(), ctor, typefor(ctor))
      ```

      `ConstantType` lives in `di.core`, not the `Type` node space: every kind there answers WHAT TYPE THIS IS, and
      this one answers how the implementer is used. A steering argument on `typefor` is not the answer either —
      the registration kind is a di concept and the primitive is domain-agnostic.
- [ ] **Document the cast as the impl-type steering mechanism**, and its boundary. A cast changes the observed
      signature's SHAPE — parameter rows, return, an overload row, a `Keyed<T, K>` slot naming a keyed
      registration the function's own parameters cannot — because derivation reads the checker's type for the
      argument expression. It cannot change the KIND: every type a callable is assignable to still carries call
      signatures, so crossing the value/factory line needs a double assertion that misdescribes the value. Kind
      is chosen by the door, shape by the cast. A stale cast silently rewrites the injection list, which is the
      failure worth calling out at the call site.
- [ ] **Restate the termination rule.** The sugar is now TWO arguments shorter than the primitive, not one — type
      and implementer type are both derived. Termination still holds because the emitted call binds a different
      overload; the wording above ("exactly one argument shorter") describes a shape this supersedes.

- [ ] **`typefor<T>()` on a named type must type as the node it yields.** `TypeFor<T>` narrows only the two
      callable kinds and drops everything else to the full `Type` union, so `typefor<Type>()` types as `Type` when
      the value is an `ImportedType`. A named type argument types as its `ImportedType` (an ambient one as its
      `GlobalType`) — the fallback narrows to `NominalType`.

      An unnamed type argument is not an error: `typefor<{ host: string }>()` yields an `ObjectType`, the same
      structural node `schemaof` would build. Narrow no further than that — the named case is the only one a call
      site demands today, so everything else keeps falling back to `Type`.

A `Keyed<Type, K>` sketch demonstrating the shape — a real service type carrying a key, with a value genuinely
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
Two things about it survive that rewrite either way:

- [ ] `Keyed` is imported as a value there; it is a type alias, so under `isolatedModules` that is a build error.
- [ ] **An aliased union must derive to its NAME, not its members.** `DeriveTyped`
      (`transforms/internal/tokens/derived.go:60`) tests `isGeneralUnion` and hands off to `deriveUnion` with no
      check for an alias first, so `Keyed<Type, K>` yields
      `tag(union(AggregateType, ConstructorType, FunctionType, …), key)` instead of
      `tag(imported('Type', '@rhombus-std/primitives'), key)`. Naming is what `typefor` does — `schemaof` is the
      verb that expands — and the expansion makes the address depend on the union's membership, so adding a kind
      to `Type` silently moves every token derived from it. The wide `boolean` intrinsic is already excluded from
      decomposition; an alias name is the same kind of exclusion. Fixing this is what makes the `Keyed<Type, K>`
      spelling below sound.

      **Gate the naming on addressability (owner refinement, 2026-08-19): only an EXPORTED alias derives to its
      name.** An address must be reconstructible by the counterparty, and a local (non-exported) alias cannot be
      spelled from anywhere else — so a local alias derives structurally, as the union itself; that is the only
      choice, not a fallback. The spelling site is also the control surface: writing the exported alias name gets
      the named address, spelling the members raw gets the structural one — one node, one reading, no node shape
      carrying both.

## Transforms engine

- [ ] **Teach mergesynth to distinguish a constructor from a plain function.** Today its one callable test,
      `isCallable` (`transforms/internal/mergesynthtransform/mergesynth.go:1405`-`:1411`), deliberately lumps
      them — true on a call OR construct signature, and nothing downstream asks which. Split it: the checker shim
      already exposes `SignatureKindCall` and `SignatureKindConstruct` as separate queries (the same split the
      `typefor` derivation uses to mint `ConstructorType` vs `FunctionType`), so recognize the two kinds
      distinctly and carry the distinction through to the synthesized guards. The runtime half of a guard is the
      delicate part — both kinds are `typeof === 'function'`, so the construct case needs an actual
      discrimination; pick the soundest available check and, if nothing non-heuristic exists for a case, say so
      in the report rather than silently shipping a guess.

## Inline discovery

- [ ] Issue #365 — discovery from `registerInlineBodies` marker calls instead of the JSON publish list, claim by
      owning package + member name off the checker's resolved overload, rest bodies over declared faces. Go side
      only.

- [ ] **The `*.extras` repattern, the TypeScript half of #365.** `getService` collapses to one overload set with a
      single rest body, the same shape `add` now has; and the instance entries come out of
      `di.extras/rhombus-std.json`, `di.extras.options/rhombus-std.json` and `config.extras/rhombus-std.json` once
      their markers are read.

### Back out the #365 shape in `di.extras` until the Go half lands

The target shape is already authored in two files ahead of the discovery that reads it, so nothing in either one
resolves today. Either land #365 first or restore the current shape in these places; the tree does not build
either way until one of them happens.

- [ ] **Name the sets again.** `libraries/di.extras/src/augmentations/Manifest-Descriptor-augmentations.ts:27` and
      `ServiceProvider-service-augmentations.ts:15` pass an anonymous object literal straight to
      `registerInlineBodies`. Today an entry's `impl` is a named export resolved by walking the barrel's
      re-export graph (`INLINE_IMPL_NOT_FOUND`, `transforms/internal/inlinetransform/bodyextract.go:265`), and
      `registerInlineBodies`' own docs say the set must be a top-level `const` for that reason. Restore
      `export const ManifestDescriptorAugmentations = {…}` / `ServiceProviderServiceAugmentations = {…}` —
      the shape `di.extras.options` and `config.extras` still carry.
- [ ] **Restore the named re-exports in `libraries/di.extras/src/index.ts`.** It now reads
      `import './augmentations'`, directly under the comment explaining why a side-effect import hides a set from
      `impl` resolution. The comment survived the edit; the exports did not.
- [ ] **Drop `...arguments` from the merged rest bodies.** Two independent blocks: `checkFreeIdentifiers`
      (`bodyextract.go:279`) admits only value params, type params, primitive imports and imported values — `this`
      is a keyword node and passes, `arguments` is an Identifier and trips `INLINE_BODY_FREE_IDENTIFIER`; and
      `Substitute` pairs params to args strictly positionally (`substitute.go:84`), so there is no variadic
      binding for a rest tail to collect. Until #365 brings rest bodies over declared faces, each member needs its
      own body with the face's parameters spelled out.
- [ ] **Reconcile `libraries/di.extras/rhombus-std.json` with the bodies that survive.** It still names
      `ManifestServiceAugmentations` and `ServiceProviderValueAugmentations`, both deleted, and carries entries for
      `addClass`/`addFactory`/`addValue`, `tryAddClass`/`tryAddFactory`/`tryAddValue` and
      `replaceClass`/`replaceFactory`/`replaceValue`, all merged into the flat verbs.
- [ ] **`getServices` and `getRequiredService` both delegate to `this.getService`**
      (`ServiceProvider-service-augmentations.ts:20`, `:23`).
- [ ] **`.apply(this, [...])` breaks the parity invariant.** The emit has to read
      `this.getService(Type.imported('IFoo', '@scope/pkg'))` — what a hand author writes — so the body forwards its
      arguments as a plain call, whatever the merge ends up being.
- [ ] **A concrete extending an augmented abstraction inherits, never redeclares.** The pattern, applied by the
      owner on disk and working for every other extended type: the concrete class pairs with an EMPTY merged
      interface — `export interface ServiceProvider extends IServiceProvider {}` — so the augmentation's overloads
      arrive by inheritance and no local redeclaration can fall out of step (the intermittent TS2430 this killed).
      Keep it, and apply it wherever a concrete's declaration still redeclares members its abstraction is
      augmented with. The pattern's one boundary: bivariant method checking lets a class member satisfy augmented
      faces with MORE parameters (why `DefaultManifest.add(descriptor)` passes every `add` sugar face), but a
      member with a required parameter can never satisfy a ZERO-argument face — `getService<T>(): T | undefined`
      is the one such face, and it is why `ServiceProvider` alone still fails TS2430. Fix at the class: declare
      the parameter optional (`getService(type?: Type)`) with a runtime throw for the absent-argument case, which
      only exists pre-transform — or carry the full overload set.

### The same conversion in `di.core`

- [ ] `libraries/di.core/src/augmentations/ServiceScopeFactory-ServiceScope-augmentations.ts` lost its namespace to
      an anonymous literal. `registerAugmentations` takes any value, so this one runs — but it leaves a dead
      `Flatten` import at `:3` and puts `this: IServiceScopeFactory` into the _face_ at `:16`, which is what the
      item below strips from `di.extras`. Restore the namespace, or keep the literal and fix both.

- [ ] **Drop the `this:` parameters from the `declare module` faces in `di.extras`.** The face is receiver-spelled
      — the interface's own generics in parameter positions, `Manifest<Scopes>` returns, no `this` parameter. As
      written, `this: Manifest` pins the receiver at `Manifest<any>` and the bare `Manifest` returns drop `Scopes`,
      which also costs scope-name checking: `scope?: string` accepts any string where `scope?: Scopes` accepts only
      the manifest's declared scopes. The namespace bodies keep their `this:` — that is where it is load-bearing.

## Exports system — make it conventional

Background, so the intent is readable: the owner once used "src-ref" for a narrow thing — a referenced project
with NO build and NO dist, whose source files are duplicated into each calling library's build. Somewhere along
the way that got misread as licensing "source" usage ANYWHERE in `package.json` `exports`, and the exports system
grew complicated and weird on the back of that miscommunication. The custom conditions, seams, and per-package
special cases are symptoms of it, not requirements.

The task: **make it not-weird — do exports the conventional way.** The owner's requirements, which are the whole
design space:

1. The editor experience must be FLAWLESS regardless of build state — clean IDE resolution, rename, find-refs,
   with nothing depending on `dist` being built.
2. It is CRITICAL that type AND value identity hold throughout the dep graph — NO DUPLICATES. One `Manifest`, one
   augmentation registry, one module instance per package, everywhere.

The run decides HOW to get there; it may NOT make design decisions beyond those requirements. If the requirements
plus conventional practice do not pin down one and only one architecture — if a genuine design fork appears — do
NOT guess and do NOT pick: halt that section and report the fork, per this doc's standing rule. The owner expects
the requirements to admit exactly one clear answer; discovering otherwise is itself the finding to report.

- [ ] Rework the `exports` maps (and whatever build/tsconfig plumbing they drag along) to the conventional shape
      satisfying the two requirements above, repo-wide.
- [ ] **`feat-src-first-exports`** is a prior crack at this that became orphaned. Before deleting it: verify it
      holds no other code useful to this branch and its direction (the exports rework itself is being redone
      fresh, not merged). Then DELETE the branch. If something useful IS found, lift it first and say so in the
      report.

## Comment sweep over the hand edits

The working tree carries a large by-hand change set (108 files). Comments were not moved with the code they
describe, so the sweep is over the whole diff, not the sites listed below — those are the ones already seen.

Two rules the sweep applies:

- **In an augmentation, the doc comment goes on the `declare module` face, never on the namespace or body.** The
  face is what a caller reads and what the emitted `.d.ts` carries; the implementation is not. Where both carry
  one, the body's goes.
- [ ] **Write the face-docs rule into `docs/features/augmentations.md`** — it does not state it yet. Also add it
      to the project `CLAUDE.md` unless CLAUDE.md's augmentations coverage already sends an augmentation author
      to that doc (its Augmentations bullet ends with a "full mechanics" pointer — judge whether that suffices
      to put the rule in the author's path; if yes, the doc alone is enough).
- The comment bar in `CLAUDE.md` — a comment explains the code in front of the reader, never how it got there.

Known sites:

- [ ] `libraries/hosting.core/src/IHostBuilder.ts:55` — the doc explains `TContainerBuilder`, dropped from the
      signature at `:60`. The sentence it justified ("so the delegate returns it") now points at
      `configureServices` alone.
- [ ] `libraries/hosting/src/HostBuilder.ts:62` — the implementation carries its own one-line doc duplicating the
      interface's, and is still `configureContainer<TContainerBuilder>` with the `as` cast at `:66` after the field
      at `:40` stopped being `unknown`.
- [ ] `libraries/di.core/src/augmentations/ServiceScopeFactory-ServiceScope-augmentations.ts` — the member's doc
      moved to the face correctly; the `Flatten` import at `:3` it left behind is dead.
- [ ] `libraries/di.extras/src/augmentations/` — both faces carry no docs at all. The member documentation went out
      with the namespaces when the bodies merged, and the face is where it belongs.

## Sweep the by-hand work for small errors

The savepoint is a large by-hand change set written across a working session, and it does not build. Go through
all of it — not only the files this doc names — and fix the small stuff: typos, a member renamed in one place and
not the other, a face and its body disagreeing, an import left behind or never added, a call site never converted
to the pattern its callee now has. That class is auto-fixed with no discussion, and
`tests/diagnostics.test/test/listener-config-factory.test.ts:75` is the archetype.

Known site: `libraries/di.core/src/augmentations/Manifest-Descriptor-augmentations.ts:114` calls a one-arg
descriptor-taking `replace(...)` that no longer exists under that name — the owner renamed the descriptor
primitives to `_add`/`_replace`/`_remove` (committed 2026-08-19; the underscore prefix is what keeps the
class's own members out of collision with the augmented un-prefixed faces). The call becomes
`this._replace(runBuilder(type, configure))`, and the sweep should convert any other site still calling a
primitive by its old un-prefixed name. Watch the editor's whole-repo program masking these: di.extras'
one-arg `replace<T>(value: T)` face makes the stale call typecheck when the file is open.

Where something does not merely have a typo but FUNDAMENTALLY does not work, or reads as a misunderstanding of how
the piece it touches behaves: do not rewrite it to what it "should" have been. Dance around it — take the smallest
path that gets the tree building and leaves the intent recoverable, and say so in the report. Where there is no
such path, halt and report. Guessing at intended semantics is the one thing worse than stopping.

## Housekeeping

- [ ] **Audit every package's dependency categories.** For all `libraries/*` (and the test/e2e packages), check
      each entry sits in the right field — `dependencies` vs `devDependencies` vs `peerDependencies` — and that
      the options are right (`peerDependenciesMeta.optional`, version ranges, `workspace:*` vs `workspace:^`).
      The governing rules: identity-load-bearing shared packages (di.core, config providers, primitives) are
      peers of their dependents per the §9/§38 invariant; a `*.extras` dep is what puts sugar in scope and spawns
      the transform; build-time-only tooling is dev. Fix miscategorizations; report anything where the correct
      category is genuinely undecidable. The devDependency duplicates of peer deps STAY (owner ruling
      2026-08-19): bun auto-installs peers, but this repo must work under other tools' semantics too — the
      duplicate is the installer-agnostic spelling, not redundancy to clean.
- [ ] **Swap every `getOrCreate` call for `Map.prototype.getOrInsert` / `getOrInsertComputed`** (whichever fits
      the site — a ready value takes `getOrInsert`, a lazily-built one `getOrInsertComputed`), then drop the
      `getOrCreate` definition entirely. TS 6's `esnext.collection` types both. A trivially-cheap default drops
      its lambda and takes the plain form — the owner's exemplar:
      `getOrCreate(this.#closed, descriptor.serviceType, () => [])` →
      `this.#closed.getOrInsert(descriptor.serviceType, [])`; reserve `getOrInsertComputed` for defaults that
      are genuinely expensive or side-effectful to build.
- [ ] **Sweep for sites where `Object.groupBy` / `Map.groupBy` reads cleaner and convert them** — hand-rolled
      accumulate-into-buckets loops are the tell.
- [ ] **Complete `replace` in `libraries/primitives/src/utils/iterable.ts` for all four declared overloads.**
      The owner specified the faces (value → `Generator<T>`, value `U` → `Generator<T | U>`, mapper
      `Func<[T], T>`, mapper `Func<[T], U>`) and committed them COMMENTED OUT in the file — uncomment them; they
      are wanted, not rejected. The body only handles the value form. Widen it to
      `replacement: U | Func<[T], U>` and apply the same function-vs-value discrimination already used for
      `match` — a matched item yields `isFunc(replacement) ? replacement(item) : replacement`. The declared
      overloads accept that a function-typed replacement VALUE is unspellable (a `Func` replacement always means
      the mapper); that ambiguity is by design, same as `match`'s.
- [ ] **Adopt the exhaustive-switch style for kind selection — `assertNever` in the default.** The exemplar is
      the owner's edit to `libraries/di/src/ServiceProvider.ts` `#getServiceFromValue`: selecting on a
      discriminated union's `kind` is a `switch` over every kind with
      `default: return assertNever(x)` (`@rhombus-toolkit/type-guards`) — never a ternary or if/else whose last
      branch silently assumes the one remaining kind. Where an expression is needed, wrap the switch in an
      immediately-invoked arrow, as the exemplar does. The same edit also sets the not-implemented style: a stub
      member throws `new NotImplementedError('Receiver.member')` inline — no shared `notImplemented` helper.
      Apply both repo-wide.
- [ ] **Author every NEW augmentation file in the owner's canonical shape** — the exemplar is
      `libraries/di.core/src/augmentations/Manifest-Descriptor-augmentations.ts` as committed by the owner
      2026-08-19: ONE `declare module` block up top carrying all faces, grouped by overload shape; then one
      `registerAugmentations` call PER overload group, each an object literal whose bodies carry only that
      group's narrow signature. The same member name registered across several calls is the point — mergesynth
      synthesizes the argument-shape dispatch, so no body ever hand-discriminates overloads (the commented-out
      `descriptorMerge` in that file is the hand-rolled version this retires). Reformat EXISTING augmentation
      files opportunistically as editing brings you to them — the reformatting is not its own task and no sweep
      is scheduled for it.
- [ ] **Reimplement `demonstrateRegistrationErrors` in
      `examples/examples.lib.without-transformer/src/errors-demo.ts`.** The owner stubbed its body to
      `throw 'not implemented'` purely to unblock the build — the fix is a REAL demonstration body (recover the
      pre-stub implementation from git history and convert it to the current authoring patterns), not an error
      cleanup. The lazily-thrown-strings sweep below must not "fix" this site by swapping the throw for a
      `NotImplementedError` and moving on.
- [ ] **Replace lazily-thrown strings with real Errors.** Sweep production code for `throw '<string>'` sites the
      owner left while moving fast. At each: choose the thrown Error type wisely (the `DiError` taxonomy where a
      container failure, `NotImplementedError` where that's what it is, plain `Error` otherwise), and adjust the
      message as needed — first checking the message's PREMISE still holds; a wrong premise gets a corrected
      message, not a reworded one. ONE exception: somewhere (a visitor implementation, most likely) a thrown
      string is VERY intentional — string-throw as control flow, identifiable by a matching `catch` clause
      nearby that expects it. Leave that one exactly as it is.
- [ ] **Conventional-commit labels on the owner's commits.** Some commits the owner made by hand on this line of
      work lack a Conventional Commits prefix. On the worktree branch (after the lift), reword every unprefixed
      commit not yet on `main` to carry the right `feat`/`fix`/`docs`/`refactor`/`chore`/`test` prefix — judged
      from the diff, not guessed. History rewriting is confined to commits that exist only on branches this run
      owns; anything already merged to `main` stays as it is.

- [ ] **`libraries/hosting/tsconfig.ci.json` names a package that does not exist** —
      `"types": ["@rhombus-std/di.core.extras"]`, where the package (and the devDependency beside it) is
      `@rhombus-std/di.extras`. That config is what `build` and `lint` run and what `tsconfig.ttsc.json` extends,
      so it fails with TS2688 before the augmentation is ever consulted. `libraries/hosting/tsconfig.json` has the
      name right.
- [ ] **Degeneralize `IHostApplicationBuilder.configureContainer` too.**
      `libraries/hosting.core/src/IHostApplicationBuilder.ts:51` still declares
      `configureContainer<TContainerBuilder>(configure?: Action<[TContainerBuilder]>): void` after the parameter
      was dropped from `IHostBuilder`. Its own doc at `:49` says what makes this mechanical: `TContainerBuilder` is
      always the `Manifest` this host builds. Nothing infers it, so it names the manifest directly. Its shape
      differs from `IHostBuilder`'s — an `Action` returning `void` rather than a returning delegate — and that
      difference is preserved, not reconciled.

- [ ] **`libraries/di/smoke.ts` leaves the package.** It is a hand-run script (`bun smoke.ts`, "not part of any
      gate") sitting at a library's root, so nothing runs it and nothing notices when it rots. Its checks are not
      throwaway, though — tuple resolution, union member-vs-whole matching, open-generic closing, latebound
      closures re-entering with call arguments, literal self-satisfaction, iterable collection vs. exact-iterable
      registration, intersection satisfaction. Audit each against `tests/di.test/test/`, port whatever has no
      counterpart there, then delete the file. Registrations get rewritten into the current authoring shape on the
      way over — the script still calls `add(Type.stringify(...), ...)` with a string type and a commented-out
      descriptor form beside it.
