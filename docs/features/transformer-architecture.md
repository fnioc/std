# Transformer architecture

`@rhombus-std/di.extras`, `di.extras.options`, `config.extras`, and `primitives.extras`
each rewrite TypeScript at compile time — `tokenfor<T>()`, `addClass<T>()`, `addOptions<T>()`,
`withType<T>()`, `resolve<T>()`, and friends. What each rewrite actually _does_ is documented on
its own package (see each package's README). This doc covers the machinery underneath all of
them: how they run in your build, and how one small set of domain-agnostic primitives — run
together, over and over, until nothing changes — replaces what used to be four separate
hand-written transform stages. It's written for anyone installing and wiring these packages into
their own project; the last section is for people working on this repo's own transformer sources.

## One engine, one pass, run to a fixed point

There is a single transform engine: a Go binary running through `ttsc`, built on
[`typescript-go`](https://github.com/microsoft/typescript-go)'s compiler internals instead of the
JS TypeScript compiler. An older ts-patch/TS5 track existed alongside it; it's gone, tagged at the
restore point `pre-tspatch-removal`. Lint and typecheck are plain `tsc --noEmit` — no plugin at
all.

The engine ships **one set of primitive, domain-agnostic transforms**. Every one of them runs on
every file, in the same fixed order, and the whole set runs **again and again until a pass
changes nothing** — a fixed point, not a single top-to-bottom sweep. There is no per-project
choice of "which stages run" any more: the old two-layer selection story (a workspace dependency
scan deciding which stage ids apply) is gone. If a `*.extras` package is on your dependency
graph at all, the whole primitive set is active for your build; if none is, no host spawns and
nothing lowers.

```
mergesynth (one-shot pre-pass)
  ↓
┌─────────────────────────────────────────────────────────────┐
│ loop until a pass changes nothing (max 16 passes):           │
│   inline → nameof → signatureof → keyof → valueof →          │
│   singular → factory → fold → schemaof                       │
└─────────────────────────────────────────────────────────────┘
```

Why a loop instead of one traversal: each transform matches only the **outermost** construct it
recognizes and rewrites it, without descending into what it just produced. A chain like
`addClass<I>(C).withSignature<T>().as<Scope>()` peels one call per pass — `addClass` lowers on
pass 1, which exposes `.withSignature<T>()` for pass 2, which exposes `.as<Scope>()` for pass 3.
Nobody had to write a receiver-recursive visitor for that; the loop supplies the recursion for
free, and every already-lowered position stays an ordinary, checker-bound AST node (no re-parse,
no re-check) because nothing ever rewrites twice.

```ts
// what you write
class Startup {
  configure(m: IServiceManifest) {
    return m.addClass<IUserRepo>(SqlUserRepo).withSignature<[IDb]>().as<
      'singleton'
    >();
  }
}
```

```ts
// pass 1: addClass lowers (nameof + signatureof fire on its new arguments)
m.addClass('app:IUserRepo', SqlUserRepo, [['app:IDb']], void 0, void 0)
  .withSignature<[IDb]>().as<'singleton'>();
// pass 2: withSignature lowers (signaturefor fires on its new arguments)
m.addClass('app:IUserRepo', SqlUserRepo, [['app:IDb']], void 0, void 0)
  .withSignature('app:IDb').as<'singleton'>();
// pass 3: as lowers (valueof fires); pass 4 is a no-op — the loop settles
m.addClass('app:IUserRepo', SqlUserRepo, [['app:IDb']], void 0, void 0)
  .withSignature('app:IDb').as('singleton');
```

**The enabling invariant is disjoint match sets.** Every transform in the loop owns matches no
other transform can claim: `inline` matches sugar declarations (a specific set of certified
member/function shapes); each primitive stage matches its own callee symbol (`nameof` only ever
matches `tokenfor`/`tokenof`/`keyedtokenfor` calls, `signatureof` only its own three names, and so
on); `fold` only matches a boolean-literal-condition ternary. Nothing in the set can produce work
for a stage that already ran this pass and claim it belongs to an earlier one — that's what makes
"run the whole set repeatedly, no intrinsic order" both correct and terminating. A new stage
added to the loop must be checked against this invariant before it's wired in.

**Order inside one pass is a reproducibility choice, not a correctness requirement.** The code
runs the stages in the fixed sequence shown above so output is deterministic across runs, but no
stage may ever depend on running before or after another one _within_ the same pass — if it did,
the loop's "just run it again" termination story would break. `signatureof`, `keyof`, and
`valueof` happen to sit after `nameof` because their call shapes are disjoint from `nameof`'s
(type-argument primitives vs. value-argument primitives), not because anything requires it.

### Termination: 16 passes, loud on exhaustion

The loop caps at 16 passes. If a 17th pass would still see a change, the build fails loudly with a
per-file `FIXED_POINT_EXHAUSTED` diagnostic — never a silent cap that ships a half-lowered file.
In practice a chain settles in well under four passes; sixteen is headroom, not a tuned budget.

Change detection is **pointer identity**, not text diffing: every stage's visitor returns the same
node it was given when nothing under it changed (the shim's `VisitEachChild`/factory-`Update`
contract already guarantees this when used correctly), so "did this pass change anything" is one
pointer comparison on the whole file, and a stage that always rebuilds its output — even when
nothing moved — would break the loop's termination signal. Every looped stage's tail helpers
(`elideNameofImports`, `elideFunctionImports`, `ensureOptionalImport`, and their siblings) return
the input unchanged when they had nothing to do, specifically to hold this contract.

### Mergesynth: a one-shot pre-pass, not a loop member

`mergesynth` (the augmentation merge-strategy synthesizer, #213) runs **once per file, before the
loop starts** — it is not one of the looped stages. Its matches
(`registerAugmentations`/`applyAugmentations` calls) are always source-written; no sugar body or
primitive ever mints a fresh one, so the loop could never generate new work for it, and giving it
a pre-pass slot makes the termination story trivially explainable without needing to reason about
whether it can re-fire. (An early loop-member version of this stage re-wrapped its own hand-merge
spreads every pass, because its detector couldn't see inside the spread it had just emitted — the
one-shot placement sidesteps that class of bug entirely, not just the one instance of it. If a
sugar body is ever added that emits an install call, `mergesynth` will need to rejoin the loop and
gain spread-recursing detection — noted here as the rejoin condition, not implemented.)

## Domain lives in TypeScript, not in Go

The old shape had three bespoke Go stages — one that understood `di.core`'s registration surface,
one that understood `IOptions<T>`, one that understood config schemas — each hand-coding a whole
family's authoring sugar as compiler-plugin logic. All three are gone. In their place:

- **One small set of domain-agnostic primitives**, each doing one mechanical thing over the
  checker (derive a token from a type, derive a dependency-signature array from a constructor,
  derive a literal value from a literal type, derive a JSON-schema literal from a record type
  shape). None of them knows what `di` or `config` or "a registration" means.
- **Shipped TypeScript sugar bodies** — ordinary, typed, single-return-expression functions,
  authored in each family's own `*.extras` package — that compose those primitives the same way a
  by-hand author would. `addClass<T>(ctor)` isn't a Go rule any more; it's a TypeScript function
  whose body is `this.addClass(tokenfor<T>(), ctor, signatureof(ctor), void 0, keyof<T>())`, and
  the generic **inline stage** substitutes that body's return expression at your call site before
  the primitive stages ever see it.

This split is a hard rule, not a style preference: **no domain name may appear in Go transform
source.** There is no `if calleeName == "addClass"` and no hardcoded `"@rhombus-std/di.core:..."`
string anywhere in the primitive stages. Domain knowledge is allowed to arrive as **data** —
a side-parsed sugar body, a checker-resolved symbol, a structurally-detected brand shape — never
as a name comparison baked into control flow. Two examples of the distinction:

- `schemaof<T>()`'s handling of config's `OPTIONAL` marker: the marker's (module, export-name)
  identity flows through the engine as a plain `valueimport.Ref` value — a piece of data threaded
  through a generic "materialize this import once, honoring an existing binding" mechanism — never
  as a branch that asks "is this config's OPTIONAL." The generalized mechanism (originally config's
  own `inject.go`) doesn't know or care what it's injecting.
- `mergesynth`'s per-member strategy guards are generated **in-process** by typia against the
  member's own parameter types, read straight off the checker — nothing about "which family" or
  "which augmentation" is ever named; the stage reacts to shape, not identity.

The corollary: **transforms never validate.** A transform reports its own inability to lower a
call (an underivable token, a non-tuple `signaturefor<T>()`, an unsupported `schemaof<T>()` field
type) — that's failure reporting about the transform's own job, and it stays. But design-mistake
policing that used to live in the domain stages (open-generic registration completeness, the old
990008/990009/990010 family) does not get re-implemented anywhere in the new engine; the runtime
already enforces the equivalent invariants at registration/resolve time, and duplicating that
check at compile time was never the transform's job to begin with.

## The primitive set

Every primitive is a throwing stub at runtime (calling it un-lowered fails loudly, never silently)
and a real declaration the checker resolves against, so a sugar body typechecks as ordinary
TypeScript with no plugin involved. Each has exactly one authoring home and one lowering stage.

| Primitive                 | Shape     | Lowers to                                                                                                                      | Home                | Stage         |
| ------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------- | ------------- |
| `tokenfor<T>()`           | type-arg  | the _service_ token for `T` — strips a `Keyed<T,K>` brand to the bare base                                                     | `primitives.extras` | `nameof`      |
| `tokenfor(value)`         | value-arg | the _produced_ token for a value — constructable → construct-sig return, callable → call-sig return, else the value's own type | `primitives.extras` | `nameof`      |
| `tokenof<T>()`            | type-arg  | the _raw_ token for `T` — never strips a `Keyed<T,K>` brand                                                                    | `primitives.extras` | `nameof`      |
| `tokenof(value)`          | value-arg | the raw token for a value's _own_ type — never unwraps a constructor/factory                                                   | `primitives.extras` | `nameof`      |
| `keyedtokenfor<T>()`      | type-arg  | the single _composed_ `base#key` token for a `Keyed<T,K>`, or the plain base for an unkeyed `T`                                | `di.extras`         | `nameof`      |
| `keyof<T>()`              | type-arg  | the key literal of a `Keyed<T,K>`, or `void 0` when unkeyed                                                                    | `di.extras`         | `keyof`       |
| `signatureof(ctor \| fn)` | value-arg | the `[[...]]` dependency-signature array for a constructor or function value                                                   | `di.extras`         | `signatureof` |
| `signaturefor<T>()`       | type-arg  | one overload's `DepSlot[]` minted from a tuple type `T`                                                                        | `di.core`           | `signatureof` |
| `signaturesfor<T>()`      | type-arg  | the whole overload set minted from a tuple-of-tuples `T`                                                                       | `di.core`           | `signatureof` |
| `valueof<T>()`            | type-arg  | a literal type's own value (the `.as<Scope>()` sugar's scope argument)                                                         | `di.extras`         | `valueof`     |
| `isSingular<T>()`         | type-arg  | `true`/`false` — is `T` a literal/null/undefined/void (Rule-2 singular)                                                        | `primitives.extras` | `singular`    |
| `singularValue<T>()`      | type-arg  | the literal value itself, for a singular `T`                                                                                   | `primitives.extras` | `singular`    |
| `isFactory<T>()`          | type-arg  | `true`/`false` — does `T` carry a call signature                                                                               | `primitives.extras` | `factory`     |
| `returntokenfor<T>()`     | type-arg  | the token of a factory type `T`'s _return_ type                                                                                | `primitives.extras` | `factory`     |
| `paramtokensfor<T>()`     | type-arg  | the `[token, ...]` array of a factory type `T`'s parameter tokens (`Inject`-brand aware); elided when empty                    | `primitives.extras` | `factory`     |
| `schemaof<T>()`           | type-arg  | the `{...}` runtime JSON-schema literal for a record type `T`                                                                  | `config.extras`     | `schemaof`    |

`signaturefor`/`signaturesfor` sit in `di.core` rather than `di.extras` because they produce
`di.core`'s own `DepSlot` shape and are legitimately callable from hand-written runtime source
too — a homing choice about the _value_, not about which stage lowers it. Every other primitive in
the table is authoring-only: it throws unconditionally if it ever runs, so it never needs a
runtime-shaped home.

### Constant-folding dead branches: the `fold` stage

A sugar body dispatches on a compile-time predicate with an ordinary ternary —
`isSingular<T>() ? singularValue<T>() : this.resolve(tokenfor<T>(), keyof<T>())`. Once `singular`
(or `factory`) lowers the predicate call to a boolean _literal_, the `fold` stage constant-folds
the whole conditional: `true ? A : B → A`, `false ? A : B → B`, post-order so a nested ternary
collapses in one pass. This runs **before the sweep**, so the primitive call sitting in the dead
branch never has to lower at all — a `singularValue<T>()` under the pruned arm of a non-singular
`T` simply disappears with its branch, rather than needing to derive a value for a type it can't
represent one for. `fold` also drops the redundant parenthesis the inline stage's own precedence
wrapper leaves around a folded ternary, so `(true ? resolve(t) : …)` collapses all the way to
`resolve(t)` — byte-identical to what a by-hand author would have written, never a stray paren
surviving into the emit.

A `singularValue<T>()` (or `paramtokensfor<T>()`/`returntokenfor<T>()`) that survives the fold
**unguarded** — i.e. genuinely reachable, not merely a dead branch — is a real authoring error and
gets a targeted diagnostic naming the problem, never a silent empty emission.

## The generic inline stage

Every primitive stage carries hand-written knowledge of exactly one call shape — `nameof` always
lowers to a token, `signatureof` always lowers to a slot array. The **inline stage** is different:
it is a generic single-expression function-inliner that learns what to substitute from a
hand-authored publish list, not from compiled-in per-family rules. A library authors its sugar as
an ordinary typed TypeScript function whose single-return-expression body is written _over_ the
primitives above, and the inline stage substitutes that body's return expression at every matching
consumer call site — the primitive stages then lower what the substitution produced, under the
same loop.

It is **workspace-only**: every entry it inlines resolves to a sibling package's real `src` file at
build time, in this repo, in this build. There is no published/carrier form of an inlined
function, no shipped src, no dist-JS resolution path for it — external consumption of the sugar
forms stays a deliberately parked follow-up.

### The publish list — `"rhombus.inline"`

A library declares its inlineable members in a `"rhombus.inline"` key in `package.json`:

```jsonc
{
  "rhombus.inline": {
    "entries": [
      {
        "type": "@rhombus-std/di.core:IServiceQuery",
        "impl": "ServiceQueryInline",
        "member": "isService",
      },
    ],
  },
}
```

The three fields map to TypeScript namespaces: `type` is a **type-namespace** export written as a
tokenfor-shaped token (`<package>:<TypeName>`) — the match anchor; `impl` is a **value-namespace**
export in the declaring package holding the body; `member` is the member name, shared by the
interface side and the impl side. A free function (no interface receiver) declares `impl` only,
with no `type`/`member`.

### How matching works

Each entry resolves **once per program through the checker**: the type reference resolves to a
module symbol, then the merged member symbol — TypeScript's declaration merging has already
unified every `declare module` augmentation of the interface into that one symbol. A structural
overload discriminator (type-parameter count, value-parameter count _and names_, `this` excluded)
separates a sugar overload from the runtime ones sharing its member name. A call site inlines iff
its resolved signature's declaration is one the merged symbol carries and the sugar entry claims —
by declaration identity, never by string comparison. **Parameter names on the body are
load-bearing** — the discriminator checks them, so a sugar body's `ctor`/`factory`/`value`
parameter names must match the declared overload's exactly, or the body silently discriminates
against the wrong (or no) call site.

Two hard build failures keep a drifted install honest: a **rogue-duplicate** check when a call
resolves to a same-named member outside the merged symbol (dist skew, two physical copies of an
interface), and an **emit sweep** that fails the build if any primitive or listed-sugar call
survives to the output un-lowered.

### Authoring rules (lint-enforced)

An inlineable body (`libraries/*/src/inline.ts`) must be exactly one `return <expr>;`, where the
expression is a single compile-time expression: no logical operators, assignments, comma
sequences, `await`/`yield`/`new`/spread, or nested functions. A conditional expression (`?:`)
**is** permitted, specifically so a body can dispatch
on a compile-time boolean primitive the way the resolve family does. Each value parameter may
appear at most once in a runtime position (unlimited inside a primitive call's arguments); type
parameters may appear only as the whole type argument of a primitive call; every other free
identifier must be a parameter, `this`, a type parameter, or an unaliased primitive import. The
`rhombus-inline` ESLint rule enforces all of this, including which package each primitive name is
allowed to be imported from (its one authoring home, per the table above).

## The sugar bodies, family by family

Everything below is ordinary TypeScript, side-parsed by the inline stage out of each package's
`src/inline.ts` and never bundled or shipped — the body is substitution source, not runtime code.

### Registration (`di.extras`)

```ts
export const ServiceManifestInline = {
  addClass<T>(this: IInlineRegistrationTarget, ctor: Ctor): IServiceManifest {
    return this.addClass(tokenfor<T>(), ctor, signatureof(ctor), void 0,
      keyof<T>());
  },
  addFactory<T>(this: IInlineRegistrationTarget,
    factory: Factory): IServiceManifest
  {
    return this.addFactory(tokenfor<T>(), factory, signatureof(factory), void 0,
      keyof<T>());
  },
  addValue<I>(this: IInlineRegistrationTarget,
    value: unknown): IServiceManifest
  {
    return this.addValue(tokenfor<I>(), value, keyof<I>());
  },
};
```

`keyof<T>()` lowers to `undefined` for an unkeyed type, and the inline stage elides both that
`undefined` argument **and** the `void 0` scope placeholder it strands behind it — so the emitted
call for an unkeyed registration is the plain 3-argument form, byte-identical to what a by-hand
author writes; a keyed one keeps the composed 5-argument call.

A **separate, zero-type-parameter** object literal (`ServiceManifestSelfInline`) covers the
no-type-arg self-registration forms (`addClass(ctor)`, `addFactory(fn)`, `addValue(value)`),
discriminated from the generic forms purely by type-parameter count — same member names, same
value-parameter names, no collision. Their token derivation is **value-derived, never
TS-inferred**: `addClass`/`addFactory` use `tokenfor(value)` (the _produced_-type primitive — a
constructable value tokenizes as the instance it builds), and `addValue` uses `tokenof(value)`
(the _raw_-type twin — an already-built value registers under its own type, never unwrapped). A
self-registration is unkeyed and lifetime-unchosen by construction, so these bodies never write a
key or scope placeholder at all.

The chain continuations follow the same shape:

```ts
export const ManifestChainInline = {
  withSignature<T extends readonly any[]>(
    this: IInlineChainTarget,
  ): IServiceManifest {
    return this.withSignature(...signaturefor<T>());
  },
  withSignatures<T extends ReadonlyArray<readonly any[]>>(
    this: IInlineChainTarget,
  ): IServiceManifest {
    return this.withSignatures(...signaturesfor<T>());
  },
  as<Scope extends string>(this: IInlineChainTarget): IServiceManifest {
    return this.as(valueof<Scope>());
  },
};
```

Each chain sugar lowers to its **own** value-arg call rather than folding back into the
registration's original arguments — `.addClass(...).withSignature<T>()` survives lowering as an
independent, hand-writable continuation, matching what a by-hand author could have chained onto
the same call.

`isService<T>()` and the resolve family (`resolve`/`resolveAsync`/`tryResolve`) both compose the
keyed lookup token with `keyedtokenfor<T>()` where the runtime member takes no separate key
parameter, and with the split `tokenfor<T>() + keyof<T>()` pair where it does:

```ts
export const ServiceQueryInline = {
  isService<T>(this: IServiceQuery): boolean {
    return this.isService(keyedtokenfor<T>());
  },
};

export const ResolverInline = {
  resolve<T>(this: IInlineResolveTarget): T {
    return isSingular<T>()
      ? singularValue<T>()
      : isFactory<T>()
      ? this.resolveFactory(returntokenfor<T>(), paramtokensfor<T>())
      : this.resolve(tokenfor<T>(), keyof<T>());
  },
  resolveAsync<T>(this: IInlineResolveTarget): Promise<T> | T {
    return isSingular<T>()
      ? singularValue<T>()
      : isFactory<T>()
      ? this.resolveFactory(returntokenfor<T>(), paramtokensfor<T>())
      : this.resolveAsync(keyedtokenfor<T>());
  },
  tryResolve<T>(this: IInlineResolveTarget): T | undefined {
    return isSingular<T>()
      ? singularValue<T>()
      : this.tryResolve(tokenfor<T>(), keyof<T>());
  },
};
```

Reading the nested ternary top to bottom: a **singular** `T` (a literal, `null`, `undefined`, or
`void`) short-circuits to the literal value itself with no runtime lookup at all — the fold stage
prunes the other two arms entirely once `isSingular<T>()` lowers to `true`. A **factory** `T` (a
function type) renames the call to `resolveFactory` and derives its return-type token plus its
parameter-token array. Everything else is the plain tokenful resolve. `resolveAsync` has no key
parameter on the runtime side, so its keyed form composes the single `keyedtokenfor<T>()` token
instead of the split pair — the same asymmetry `isService` has, for the same reason.

### Options (`di.extras.options`)

```ts
export const ServiceOptionsInline = {
  addOptions<T>(this: IInlineOptionsTarget): IServiceManifest {
    return this.addOptions(tokenfor<IOptions<T>>(), tokenof<T>());
  },
};
```

The two tokens are relationally locked: the wrapper (`IOptions<T>`) is a **composed generic**
whose base type — `IOptions`, imported from `@rhombus-std/options` — is a type external to this
body's own package. The inline stage captures that composed use (base module + export name + the
call-site-bound argument types) and a downstream `nameof` handler resolves the base symbol against
the _consumer's_ program before deriving the wrapper token — the body-external-type-reference
capability that made this sugar possible without a bespoke options stage. The element half uses
`tokenof<T>()` (the raw, alias-preserving primitive), not `tokenfor<T>()`, specifically so a
`Keyed<T,K>`-branded `T` derives the _same_ raw reference both inside the wrapper's inner leaf and
as the standalone element token — a mismatch here would silently register the options value under
a token that never matches what the wrapper token composes.

This works for _any_ type a consumer's program can resolve, by construction: the sugar call only
typechecks because `di.extras.options`'s `declare module` augmentation is in the program, and that
package peers `@rhombus-std/options` — so `IOptions` is always resolvable wherever `addOptions<T>()`
compiles at all.

### Config (`config.extras`)

```ts
export const ConfigBuilderInline = {
  withType<T>(this: IWithSchemaTarget): unknown {
    return this.withSchema(schemaof<T>());
  },
};
```

`schemaof<T>()` walks `T`'s member shape (nested records, casing, optionality) into the same
runtime schema-literal grammar `withSchema({...})` accepts by hand — the walk itself is a
domain-free "type → structural literal" engine; the config-specific part is only the _identity_ of
the `OPTIONAL` wrapper it emits for an optional field, threaded through as data (see [Domain lives in TypeScript, not in Go](#domain-lives-in-typescript-not-in-go)). An unsupported field shape
(union, tuple, function, index signature, a non-object root) is a targeted diagnostic naming the
unsupported construct, and leaves the `schemaof<T>()` call un-lowered rather than emitting a wrong
schema.

## Checker-anchoring: why every matcher guards synthetic nodes

A primitive stage anchors a call two different ways depending on where the call came from: a
**source-written** call (`tokenfor<IWidget>()`, typed by hand) resolves its callee symbol through
the checker directly; a **substituted** call (the same expression, freshly spliced in by the
inline stage from a sugar body) has no checker symbol of its own — its callee is a cloned node
from the body's source file, and the stage instead reads the type/value the inline stage already
bound and recorded in its **artifacts** (see below).

Every checker-anchored matcher must guard against being handed a **synthetic** node — one built by
a later stage in the same run, never seen by the original parse/check — because
`checker.GetResolvedSignature` (and friends) panics on a node with no real position. The guard is:

```go
if node.Pos() < 0 || node.Parent == nil {
    return nil, false // synthetic node — never a checker-anchored candidate
}
```

This looks obvious in isolation, but it caught a real bug: after the fixed-point loop landed, the
inline matcher was re-matching **its own already-lowered output** on the next pass.
`.withSignature<[]>()` lowered correctly to `.withSignature()` on pass 1, and on pass 2 the
matcher tried to resolve that zero-arg call against the sugar overload again — `RecoverTypeArguments`
failed on a call with no type arguments to recover, and the build failed with a spurious
"inferred type argument" diagnostic despite the emitted code being byte-correct. The fix wasn't
where it first looked: the _callee_ of the re-matched call turned out to have a non-negative
`Pos()` (the substitution step clones the sugar body's AST and preserves the clone's foreign but
still-non-negative source positions), so a callee-only guard never fired. The **call expression
itself** was the synthetic node — rebuilt fresh by the signature stage when it elided an empty
spread — with `Pos() < 0`. The guard has to sit on the call node passed to
`GetResolvedSignature`, not on its callee, and `node.Parent` has to be re-checked every pass
(`SetParentInChildrenUnset` re-links it after each changed pass) — a stale parent from an earlier
pass is exactly the kind of thing that looks fine until it silently isn't. Every new
checker-anchored matcher added to the engine needs this same guard, on the same kind of node
(whatever it feeds to the checker), verified against a real `ttsc` build — a Go-level unit test
using synthetic fixture nodes can pass while the real pipeline's actual synthetic-node shape still
breaks it, since a hand-built fixture doesn't necessarily reproduce which specific node in the
chain ends up synthetic.

## The artifacts hand-off

The inline stage's per-run **artifacts** are how a substituted call — one with no checker symbol
of its own — reaches a downstream primitive stage at all. As the inline stage substitutes a body,
it walks the freshly-spliced expression and records every primitive call it finds, keyed by **node
identity** (not by name or position), against the checker-bound type or value from the _original_
call site:

- a **type-argument** primitive (`tokenfor<T>()`, `isSingular<T>()`, …) records the bound
  `*checker.Type` for each type parameter;
- a **value-argument** primitive (`signatureof(ctor)`, `tokenfor(value)`) records the original,
  program-bound argument node itself, so the consuming stage can still query the checker through
  it even though the primitive's own callee is synthetic;
- a **composed-generic** use (`tokenfor<IOptions<T>>()`, where `IOptions` is a type external to
  the sugar body's own package) records the base type's module + export name as data, plus the
  call-site-bound argument types — resolved against the _consumer's_ program later, in the
  lowering stage that owns the token-derivation context.

A downstream stage (`nameof`, `signatureof`, `keyof`, `valueof`, `singular`, `factory`,
`schemaof`) checks the artifacts map first for any call it visits; a hit means "this is my
substituted work from this run," a miss falls through to the ordinary checker-anchored
source-written path. After the loop's final pass, an **emit sweep** walks the artifacts one more
time and fails the build if anything registered there — or any listed sugar call — survived
un-lowered into the output. That sweep is the tripwire that would catch a stage silently failing
to claim work it should have.

## Failure semantics: a diagnostic, never a silent empty token

Every token-shaped primitive follows one rule: an **underivable** derivation (an anonymous type
with no export name, a type the checker can't resolve, a base type that isn't in the program)
never emits an empty string, `null`, or any other silent placeholder. It either:

- leaves the call **un-lowered** with no diagnostic, if the failing use is a _synthetic_
  (substituted) one that hasn't reached the sweep yet — because a dead ternary branch's primitive
  call might still get pruned by `fold` before anyone needs its value, and erroring before that
  prune would fail builds that are actually fine; or
- emits a **targeted diagnostic** naming the specific problem, if the failing use is
  _source-written_ (a human wrote `tokenfor<AnonymousType>()` directly) — where there's no later
  pruning step that could still rescue it.

The sweep is the backstop for the first case: a synthetic use that never got pruned and never got
lowered is exactly what the sweep exists to catch. Nothing in the loop ever silently succeeds with
a wrong or empty answer.

## Why one pass per file, not a chained pipeline

`ttsc` runs a transform as a single source-to-source rewrite: it reads your original file once and
writes the rewritten file once, even though _inside_ that one rewrite the loop above may run the
stage set several times. It could instead chain stages at the `ttsc` level — feed one stage's
_output_ into the next as separate source-to-source passes — but that corrupts source maps: each
stage records the character offsets it rewrote against the text it was given, and if a later stage
ran against an already-rewritten text, its recorded offsets would point into that intermediate
text, not the file you actually wrote. Your editor's "go to definition" and your stack traces would
land on code that no longer exists anywhere you can see it. Running the whole loop inside one
`EmitContext`, over one loaded program, keeps every recorded position anchored to your original
source the entire time.

The same reasoning ruled out a few other shapes, all considered and rejected during the original
single-engine design (still true here):

- **Per-combination hand-authored hosts** (a package for `di+options`, another for `di+config`, …)
  — the combination space grows with every new stage; not tenable past two.
- **Family-partitioned hosts** (one binary per family) — a coarser version of the same problem.
- **Dynamic loading** (stages as `.so`/WASM plugins) — real ABI cost with no corresponding win,
  and a re-ship-per-toolchain-pin treadmill the moment `ttsc`'s pinned Go version moves.
- **Build-time generated hosts** (synthesize the combined binary's source per project) — poisons
  the whole-module build cache.

One binary, every stage linked in and always active, is the shape that avoids all four — and the
fixed-point loop is what let the _selection_ half of the old design (which stage runs for which
consumer) disappear entirely, since there's no longer a "which stages" question to answer.

## Wiring a transformer into your project

Depend on the `*.extras` package for the sugar you want:

```jsonc
// package.json
{
  "devDependencies": {
    "@rhombus-std/di.extras": "^11.0.0",
  },
}
```

You still need two tsconfigs, because typecheck and lowering are different concerns run by
different tools — but the lowering one only needs to _exist_:

```jsonc
// tsconfig.json — your normal config. The `types` array pulls in the phantom
// `declare module` augmentation your sugar needs — TS only applies a
// declaration merge for a file actually pulled into the program.
{
  "compilerOptions": {
    "types": ["@rhombus-std/di.extras"],
  },
}
```

```jsonc
// tsconfig.ttsc.json — marks this package for lowering. No `plugins` array
// is needed: the primitive set is always-on once a host spawns at all.
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
  },
}
```

The only thing that still gates whether a Go host spawns for your build is stock `ttsc`'s own
direct-dependency auto-discovery — it looks at your project's own `package.json` for a
`"ttsc": { "plugin": { "transform": "..." } }` marker. Every `@rhombus-std/*.extras` package
carries one, and every one of them resolves to the same Go source directory
(`transforms/cmd/ttsc-std`), so depending on any single one is enough — the resulting host runs
the full always-on primitive set regardless of which descriptor spawned it. There is no second
layer deciding _which_ stages apply any more; that question doesn't exist in this design.

## Toolchain & publishing

You do not need Go installed to build with these transformers. `ttsc` resolves a Go compiler in
this order: an explicit override, then a platform-specific bundled SDK it installs as an optional
dependency, then a couple of local fallback locations, then whatever `go` is on your `PATH`. For
the overwhelming majority of consumers, the bundled SDK is the one that fires — install the
packages, run your build, and a working Go toolchain is already there. No system-wide Go, nothing
to provision by hand, and once that optional dependency is downloaded once, the build works
offline.

This repo pins its own Go version through `mise` (matching what CI uses) so maintainer builds and
CI builds compile the identical binary — that's a monorepo-local choice for reproducibility, not
something a downstream consumer needs to replicate.

Building the shared binary also needs a couple of supporting Go modules (the `ttsc`/
`typescript-go` shims) that a plugin's own source doesn't declare as dependencies — `ttsc` resolves
those itself by adding its own known-good copies as workspace overlays during the build, so a
transformer's Go source stays free of hand-maintained `go.sum` entries for compiler-internal
packages it only borrows types from.

## Internals (for maintainers of this repo's own transformer sources)

The shared binary lives at `transforms/cmd/ttsc-std` and links every stage above, built from
`transforms/internal/stdhost`'s `BaseStages()` (the ordered stage table — the slice order **is**
the canonical execution order) — one host, one loop, no bundle/preset expansion left to configure.
The command itself is a thin `main` that composes the stage table into a `Host` value and hands
it to `stdhost.Run`; almost everything else — the per-file loop, the mergesynth pre-pass split,
the emit sweep, and the JSON envelope `ttsc` reads back — lives in `stdhost`, not the command.

Each `@rhombus-std/*.extras` package's `./ttsc` descriptor is a thin JS module (`ttsc.mjs`) that
`ttsc` loads to resolve an absolute path back to `transforms/cmd/ttsc-std`; every descriptor
resolving to that same directory is what lets `ttsc` dedupe every consumer to one cache key and
one compiled binary regardless of how many descriptors are in play.

Adding a new primitive means: write the Go transform under `transforms/internal/<name>transform`,
add its `Stage{...}` entry to `BaseStages()` at the position the canonical order calls for
(disjoint-match-set check against every existing stage first), decide its one authoring home (a
`*.extras` package if it's family-specific and typed against that family's own types, or
`primitives.extras` if it's genuinely domain-neutral), give the stub a throwing-runtime
declaration there, and — if it's meant to be called from a sugar body rather than by hand — add
the guard/anchoring pair (checker-anchored source-written path + artifacts-anchored synthetic
path) every existing primitive stage follows.

## Design history: the detours that shaped this engine

A few decisions here came from bugs found empirically during the rewrite, not from the initial
design — recorded because the _reason_ they're shaped this way isn't obvious from the code alone.
Each is recorded in `docs/decisions.v2.md` (§115–§123).

- **The re-match guard** (see [Checker-anchoring](#checker-anchoring-why-every-matcher-guards-synthetic-nodes)
  above) — the fixed-point loop's own re-matching of its prior pass's output was the first
  concrete proof that "guard every checker call against a synthetic node" needed to be an
  engine-wide rule, not a per-stage judgment call.
- **The `addValue` raw-type split** — an early single-primitive design for the no-type-arg
  self-registration forms used the _produced_-type derivation (`tokenfor(value)`) for `addValue`
  too, which silently diverged from the by-hand form for a function-valued `addValue` (it would
  derive the function's _return_ type instead of the function's own type). The fix split
  `tokenof`/`tokenfor` into distinct raw-vs-produced primitives rather than trying to make one
  primitive branch on which verb called it — keeping the domain-neutral primitive genuinely
  domain-neutral meant the _verb_ (registration-body-side knowledge) has to pick which primitive
  to call, not the primitive guessing at its caller.
- **The keyed-semantics fix (§98)** — the resolve/isService/resolveAsync bodies originally derived
  their single token with `tokenfor<T>()`, which strips a `Keyed<T,K>` brand — silently matching
  the _wrong_ (unkeyed) registration, or matching nothing, for a keyed lookup. The fix routes the
  single-token consumers through the raw-preserving `tokenof<T>()`/`keyedtokenfor<T>()` primitives
  instead, so a keyed resolve actually round-trips a keyed registration; the registration bodies
  themselves were already correct (they split base + `keyof` onto separate arguments) and were
  untouched.
- **The transitive-witness fix** — a consumer reaching a sugar-target module only _transitively_
  (importing `@rhombus-std/di` without importing `@rhombus-std/di.core` directly, even though
  `di`'s own bundle re-exports it) could make the inline stage's module-resolution check return
  "absent" and go inert for that consumer's whole program, even though every sugar call in it
  would otherwise have lowered correctly. The fix adds a module-_resolution_ fallback (asking the
  program to actually resolve the specifier, not just scanning for an existing specifier AST node)
  behind the specifier scan, so a re-exported-but-not-directly-imported module still counts as
  present.
