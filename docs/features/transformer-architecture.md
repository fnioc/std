# Transformer architecture

`@rhombus-std/di.extras`, `di.extras.options`, `config.extras`, and `primitives.extras`
each rewrite TypeScript at compile time — `typefor<T>()`, `addClass<T>()`, `addOptions<T>()`,
`withType<T>()`, `getService<T>()`, and friends. What each rewrite actually _does_ is documented on
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
│   inline → typefor → schemaof                                │
└─────────────────────────────────────────────────────────────┘
```

Why a loop instead of one traversal: each transform matches only the **outermost** construct it
recognizes and rewrites it, without descending into what it just produced. A chain like
`addClass<I>(C).withSignature<T>()` peels one call per pass — `addClass` lowers on pass 1, which
exposes `.withSignature<T>()` for pass 2. Nobody had to write a receiver-recursive visitor for
that; the loop supplies the recursion for free, and nothing is ever rewritten twice. What a
lowered position is NOT is checker-bound — the node a stage mints is unknown to the binder — so a
stage never asks the checker about the tree the loop hands it; it resolves back to the parse node
first (see [Parse-anchoring](#parse-anchoring-the-checker-only-ever-sees-pass-0-syntax)).

```ts
// what you write
class Startup {
  configure(m: Manifest) {
    return m.addClass<IUserRepo>(SqlUserRepo).addFactory<IThing>(makeThing);
  }
}
```

```ts
// pass 1: addClass lowers (typefor fires on its new arguments)
m.addClass(Type.imported('IUserRepo', 'app'), SqlUserRepo,
  Type.ctor(Type.imported('SqlUserRepo', 'app'), [[Type.imported('IDb', 'app')]]))
  .addFactory<IThing>(makeThing);
// pass 2: addFactory lowers (typefor fires on its new arguments); pass 3 is a no-op — the loop settles
m.addClass(Type.imported('IUserRepo', 'app'), SqlUserRepo,
  Type.ctor(Type.imported('SqlUserRepo', 'app'), [[Type.imported('IDb', 'app')]]))
  .addFactory(Type.imported('IThing', 'app'), makeThing, Type.func(Type.imported('IThing', 'app'), [[]]));
```

**The enabling invariant is disjoint match sets.** Every transform in the loop owns matches no
other transform can claim: `inline` matches sugar declarations (a specific set of certified
member/function shapes); each primitive stage matches its own callee symbol (`typefor` only its
own name, `schemaof` only its own). Nothing in the set can produce work for a stage that already
ran this pass and claim it belongs to an earlier one — that's what makes "run the whole set
repeatedly, no intrinsic order" both correct and terminating. A new stage added to the loop must
be checked against this invariant before it's wired in.

**Order inside one pass is a reproducibility choice, not a correctness requirement.** The code
runs the stages in the fixed sequence shown above so output is deterministic across runs, but no
stage may ever depend on running before or after another one _within_ the same pass — if it did,
the loop's "just run it again" termination story would break. `schemaof` happens to sit after
`typefor` because its call shape is disjoint from `typefor`'s (a distinct callee name), not because
anything requires it.

### Termination: 16 passes, loud on exhaustion

The loop caps at 16 passes. If a 17th pass would still see a change, the build fails loudly with a
per-file `FIXED_POINT_EXHAUSTED` diagnostic — never a silent cap that ships a half-lowered file.
In practice a chain settles in well under four passes; sixteen is headroom, not a tuned budget.

Change detection is **pointer identity**, not text diffing: every stage's visitor returns the same
node it was given when nothing under it changed (the shim's `VisitEachChild`/factory-`Update`
contract already guarantees this when used correctly), so "did this pass change anything" is one
pointer comparison on the whole file, and a stage that always rebuilds its output — even when
nothing moved — would break the loop's termination signal. Every looped stage's tail helpers
(`elideTypeforImports`, `elideSchemaofImports`, `ensureOptionalImport`, and their siblings) return
the input unchanged when they had nothing to do, specifically to hold this contract.

### Mergesynth: a one-shot pre-pass, not a loop member

`mergesynth` (the augmentation merge-strategy synthesizer) runs **once per file, before the
loop starts** — it is not one of the looped stages. Its matches
(`registerAugmentations`/`applyAugmentations` calls) are always source-written; no sugar body or
primitive ever mints a fresh one, so the loop could never generate new work for it, and giving it
a pre-pass slot makes the termination story trivially explainable without needing to reason about
whether it can re-fire. (An early loop-member version of this stage re-wrapped its own hand-merge
spreads every pass, because its detector couldn't see inside the spread it had just emitted — the
one-shot placement sidesteps that class of bug entirely, not just the one instance of it. If a
sugar body is ever added that emits an install call, `mergesynth` will need to rejoin the loop and
gain spread-recursing detection — noted here as the rejoin condition, not implemented.)

#### The guardable surface: public, string-keyed members only

Guards are generated for **the public, string-keyed instance surface** — the members a caller
can actually name on a value of the type. Three member shapes are outside that surface and never
contribute a guard clause:

- **`#`-named fields**: ECMAScript private names are not string-keyed properties at runtime.
  `Reflect.ownKeys(new C())` does not list them and `obj["#x"]` is always `undefined`, so a key
  derived from one could never match anything.
- **`private`/`protected` members**: these cannot be supplied from outside the class.
- **Symbol-keyed members** (e.g. `[Symbol.iterator]`): no string key can address them.

This enumeration lives in `internal/typesurface`, which both `mergesynth` and the `schemaof`
schema walk consume — the two walks share one surface definition, so they cannot reach different
verdicts on the same type.

The type of a member is read from its **accessor declaration** where one exists, not from its
symbol flags. A mapped type (`Partial<T>`, `Readonly<T>`, `{ [K in keyof T]: T[K] }`) remints
every member as a plain property symbol while keeping the original `get`/`set` node as that
symbol's declaration. Reading `SymbolFlagsAccessor` makes an accessor invisible behind any
mapping; reading the declarations does not.

Accessors are **directional**: `Surface.Readable()` returns only members a value can be read
from (the surface a guard can check); `Surface.Writable()` returns only members a value can be
written to (the surface a schema can populate). A `set`-only accessor contributes no readable
clause; a `get`-only accessor contributes no writable schema key. A type that declares members
but exposes none in the needed direction (`NothingReadable()`/`NothingWritable()`) is refused
rather than silently emitting an empty result.

#### The whitelist: typia's fast path is decided by positive recognition

Whether to hand a type's guard straight to typia's is-programmer is decided by `typiaFaithful`:
a **whitelist**, deliberately total — it ends in `return false`, so every construct not
positively recognized above it goes to the composer or is refused. The direction matters: a
blacklist's unrecognized positions default to "emit anyway," so each forgotten case produces a
silently vacuous clause. A whitelist's unrecognized positions default to the composer or a
refusal, both of which are honest.

Positions typia would render unfaithfully include:

- **Symbol-keyed data properties**: typia keys a clause on the checker's internal mangled name,
  which no runtime object carries.
- **Accessors behind a mapped type**: typia reads symbol flags, so it sees "property" where the
  declaration still says "accessor" and skips the member — emitting no clause, as if the member
  weren't there.
- **A wholly `private`-modifier surface**: typia filters those correctly, reducing the object to
  an empty check that accepts every object.
- **An intersection with a primitive constituent** (a branded primitive like
  `string & { readonly __brand: "UserId" }`): typia drops the primitive half, leaving a check
  whose clauses the primitive's own values fail.

Anything not admitted by the whitelist goes to first-party composition.

#### First-party composition: what `guardForType` builds instead

For types typia would not render faithfully, `guardForType` composes a guard position by
position:

- **Unions** (`||`-disjunction): every arm must have a guard — a union cannot drop an arm
  without accepting values the type does not admit.
- **Intersections** (`&&`-conjunction): if any constituent is a primitive, the primitives alone
  decide (the object half of a brand type is phantom at runtime — conjoining a check for it
  would reject every genuine value).
- **Arrays** (`Array.isArray(input) && input.every(e => g(e))`): element-wise.
- **Tuples**: `Array.isArray` plus length bounds, then a positional clause per required/optional
  element; a rest or variadic element leaves no fixed position, falling through to the array
  floor.
- **String-index-signature records** (`Object.values(input).every(v => g(v))`): the index
  value type decides the per-value check; named members alongside the index contribute their own
  clauses.
- **Nominal built-ins** (`instanceof`): only for types whose values cannot exist without their
  constructor — `Map`, `Set`, `Date`, `RegExp`, `ArrayBuffer`, `WeakMap`, `WeakSet`, and
  similar. Structurally satisfiable interfaces (`Error`, `ReadonlyMap`, `Iterable`) do not belong
  here: `const e: Error = { name: "a", message: "b" }` is a legal value that `instanceof Error`
  refuses. Those fall through to per-member clause composition.
- **Callables and symbols**: `typeof input === "function"` / `typeof input === "symbol"` — the
  whole of what can be checked for them.
- **Object and class types**: one clause per public, readable member — the same `typesurface`
  enumeration as the whitelist test, so a `set`-only accessor contributes no clause and the
  clauses around it stand.

#### The identity gate: nominal admission is not name admission

The one place `mergesynth` turns a type into a built-in's name is `libraryNominalName`, which
first asks `typesurface.FromLibrary` about identity before reading the name. `FromLibrary`
admits only a class or interface declared entirely in a default library file — not a structural
type like `Partial<T>` (whose declaration is in `lib.es5.d.ts` but whose membership is a shape),
and not a type from an installed package (whose declaration is in `node_modules`).

This matters because name is not identity: a first-party `interface Set { bag: Opts }` is named
`"Set"` but is not the global `Set`. Both the fast path and the composer route nominal decisions
through `libraryNominalName`, so the two cannot answer differently for the same type.

#### The floor contract and arity preservation

A position the composer cannot decompose costs its own clause and nothing more — the guard
around it still stands. The weakest honest check for an object type is `objectKindCondition`:

```js
(typeof input === 'object' || typeof input === 'function') && input !== null;
```

This is the shared prefix of every composed object guard, and the whole of the floor. Two
tighter-looking alternatives are each false for values the type admits:

- `typeof input === "object"` on its own rejects functions, which `Function` and every callable
  interface admits.
- `!Array.isArray(input)` rejects arrays, which `ArrayLike<T>`, `Iterable<T>`, and `object`
  admit.

The `object` keyword type gets a dedicated `nonPrimitiveGuard` that emits `objectKindCondition`
without reporting it as a weakening — that condition is not a floor _under_ `object`, it is the
whole of it.

**No clause is ever emitted when it cannot decide.** A guard with nothing to say (`node == nil`)
is dropped rather than written as `true`. A floor in rest-parameter position is also dropped:
the rest slice is an array by construction, so `Array.isArray(args.slice(N))` is always true and
emitting it would look like a check while deciding nothing.

**The arity gate is preserved on every refusal.** When a parameter's type guard is dropped, the
synthesized strategy still enforces `args.length` bounds derived from the signature. A dropped
guard never widens dispatch beyond what the guarded original allowed. The only member that
reaches the always-pass strategy (which imposes no bounds at all) is one whose every parameter
was un-derivable in the first place — no annotation, `any`/`unknown`, or a type parameter.

A synthesized guard may be **weaker** than the type it checks — it must not reject a value the
declared type admits. It may never be **narrower** — it must not dispatch more broadly than the
original it replaced. Every weakening is reported as a `MERGESYNTH_PRIVATE_SURFACE` warning
naming what the emit actually contains: a floored position, an unchecked position beside other
working clauses, or a dropped parameter guard with arity bounds standing.

## Domain lives in TypeScript, not in Go

The old shape had three bespoke Go stages — one that understood `di.core`'s registration surface,
one that understood `IOptions<T>`, one that understood config schemas — each hand-coding a whole
family's authoring sugar as compiler-plugin logic. All three are gone. In their place:

- **One small set of domain-agnostic primitives**, each doing one mechanical thing over the
  checker (address a type, derive a dependency-signature array from a constructor, derive a
  literal value from a literal type, expand a record type into the `Type` tree describing its
  members). None of them knows what `di` or `config` or "a registration" means.
- **Shipped TypeScript sugar bodies** — ordinary, typed, single-return-expression functions,
  authored in each family's own `*.extras` package — that compose those primitives the same way a
  by-hand author would. `addClass<T>(...)` is not a Go rule; it is a TypeScript function whose
  body is `(this as any).addClass(typefor<T>(), ctor, implementerType, scope, key)`, and the generic **inline stage**
  substitutes that body's return expression at your call site before the primitive stages ever see
  it.

This split is a hard rule, not a style preference: **no domain name may appear in Go transform
source.** There is no `if calleeName == "addClass"` and no hardcoded `"@rhombus-std/di.core:..."`
string anywhere in the primitive stages. Domain knowledge is allowed to arrive as **data** —
a side-parsed sugar body, a checker-resolved symbol, a structurally-detected brand shape — never
as a name comparison baked into control flow. Two examples of the distinction:

- the runtime `Type` namespace object a lowered tree is spelled through: its (module, export-name)
  identity flows to the engine as a plain `valueimport.Ref` value — a piece of data threaded through
  a generic "materialize this import once, honoring an existing binding" mechanism — never as a
  branch that asks which package it came from. The mechanism doesn't know or care what it's
  injecting.
- `mergesynth`'s per-member strategy guards are generated **in-process** by typia against the
  member's own parameter types, read straight off the checker — nothing about "which family" or
  "which augmentation" is ever named; the stage reacts to shape, not identity.

The corollary: **transforms never validate.** A transform reports its own inability to lower a
call (an underivable token, an unsupported `schemaof<T>()` field type) — that's failure reporting
about the transform's own job, and it stays. But design-mistake
policing that used to live in the domain stages (open-generic registration completeness, the old
990008/990009/990010 family) does not get re-implemented anywhere in the new engine; the runtime
already enforces the equivalent invariants at registration/resolve time, and duplicating that
check at compile time was never the transform's job to begin with.

## The primitive set

Every primitive is a throwing stub at runtime (calling it un-lowered fails loudly, never silently)
and a real declaration the checker resolves against, so a sugar body typechecks as ordinary
TypeScript with no plugin involved. Each has exactly one authoring home and one lowering stage. The
Example/Result columns below are each one real lowering pulled from the engine's own test suite;
`pkg:` stands in for whatever module the example type is declared in — a real token carries that
module's actual name instead.

| Primitive        | Shape     | Lowers to                                                                                        | Example                                                | Result                                                                                  | Home                | Stage      |
| ---------------- | --------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------- | ------------------- | ---------- |
| `typefor<T>()`   | type-arg  | the runtime `Type` node addressing `T`, narrowed to `ConstructorType`/`FunctionType`/`Type`      | `typefor<IBar>()`                                      | `Type.imported("IBar", "pkg")`                                                          | `primitives.extras` | `typefor`  |
| `typefor(value)` | value-arg | the `Type` a value's OWN type spells, never unwrapped — a class arrives as the constructor it is | `typefor(Foo)` (`class Foo { constructor(a: IA) {} }`) | `Type.ctor(Type.imported("Foo", "pkg"), [[Type.imported("IA", "pkg")]])`                | `primitives.extras` | `typefor`  |
| `schemaof<T>()`  | type-arg  | the `Type` tree describing a record type `T`'s members, stopping at every name                   | `schemaof<{ ssl?: boolean }>()`                        | `Type.object({ ssl: Type.union(Type.global("boolean"), Type.typeLiteral(undefined)) })` | `config.extras`     | `schemaof` |

Every primitive in the table is authoring-only: it throws unconditionally if it ever runs, so
none of them needs a runtime-shaped home.

**Where a `typefor` result is written.** The `Result` column above is the tree the type spells; a
project chooses where that tree LANDS with
`"rhombus-std": { "typefor": { "emit": "hoisted" | "inline" } }`. It is read through the same
resolution every rhombus-std config reader shares, so it may sit in the package.json marker or in
any file that marker `extends` — including the `rhombus-std.json` a markerless package.json reaches
by default.

- **`hoisted`** (the default) collects every derived type into one generated module,
  `__typefor__.js`, written at the program's `outDir` — which for a lowering-enabled package is the
  per-file stage directory the plugin-free bundle pass consumes. Each call site carries a reference
  to a named const, and the file imports the consts it reached.
- **`inline`** writes each tree out at the call site it was derived for, exactly as the column
  shows.

The table is a DAG: a node interns under its own canonical spelling, children intern before
parents, and a composite const references its member consts by name — so the module holds one
const per DISTINCT type and no subtree is spelled twice. A name is `$` plus the sanitized spelling plus, for any spelling that was not already
entirely alphanumeric, a short hash of it; it is a pure function of the spelling, so it is stable
across builds and independent of which file reached the type first.

```js
// __typefor__.js
import { Type } from '@rhombus-std/primitives';

export const $orders_IClock_3f9a2b1c8d = Type.imported('IClock', 'orders');
export const $Promise_orders_IClock_c07e41a95b = Type.global('Promise', [$orders_IClock_3f9a2b1c8d]);
```

The mode rides the PROJECT, never the shared `./ttsc` descriptor: the descriptor is what every
consumer dedupes to one spawn and one cache key, so nothing that varies per consumer can live there.
Emission never changes what a tree evaluates to — the runtime interns structurally identical types
to one object — and `tests/typefor.ttsc.e2e` pins that by expanding every const back into its call
sites and comparing against the inline emission byte for byte.

**`schemaof<T>()` / `.withType<T>()` surface constraints.** The expansion uses the same
`typesurface` enumeration as the guard walk, but reads the **writable** direction — coercion
assigns into a field, so a `get`-only accessor is as unusable as a `#`-named field. A type
whose entire declared surface is unwritable (every member is `#`-named, `private`/`protected`,
symbol-keyed, or a `get`-only accessor) is hard error 992003: its expansion would be an object type
with no members, which describes nothing, and nothing is emitted. Two boundary cases follow:

- `Partial<T>`, `Readonly<T>`, and `Pick<T, K>` expand. These are mapped types, and a mapped
  type's reminted symbols still carry the original accessor declarations — so the writable
  surface is faithfully enumerated through any of them.
- A type whose only members are `get`-only accessors (nothing writable) is refused with hard
  error 992003. The same type would succeed as a guard target (its accessors are readable).

**Expansion stops at a name.** A member whose type has a name of its own is kept as that name —
spelled exactly as `typefor` would have spelled it — and is never opened up. Only what has no name
of its own (an inline structure, a tuple) is expanded in place. That is what makes the walk
terminating without a depth cap or a visited set: a self-referential type reaches its own name and
stops. It also means the refusal above only ever reaches a type the walk actually opens up; a member
naming a class never has that class's surface consulted at all.

## The generic inline stage

Every primitive stage carries hand-written knowledge of exactly one call shape — `typefor` always
lowers to a `Type` node, `schemaof` always lowers to the `Type` tree describing a record's members.
The **inline stage** is different:
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

### Discovery — the `registerInlineBodies` marker call, and the `"inline"` `"entries"` list

The stage discovers what to substitute from two channels, merged with duplicates removed on
(type, impl, member):

- **The marker call**, for instance members. A `registerInlineBodies<Receiver>(TheSet)` statement
  beside a body set carries everything an entry needs — the receiver as its type argument
  (resolved through the file's imports, its own type arguments stripped), the owning package plus
  the set identifier as the impl, and the set's own exported members as the member names — so the
  set's entries are discovered from the source itself, one per member.
- **The `"entries"` list**, for every shape — including the floater, which only it can express
  (`impl` only, with the impl function's own source as the body; no marker call can spell a
  receiverless entry). A package may publish by marker, by list, or by both.

A library that publishes by list declares its inlineable members in the `"entries"` list of a
`"rhombus-std"` marker's `"inline"` object in `package.json`:

```jsonc
{
  "rhombus-std": {
    "inline": {
      "entries": [
        {
          "type": "@rhombus-std/di.core:Manifest",
          "impl": "@rhombus-std/di.extras:ManifestServiceAugmentations",
          "member": "addClass",
        },
      ],
    },
  },
}
```

Fields are partitioned by KIND, not just presence: `type` names a TYPE — a `TypeIdentifier`
reference (`ImportedType`; never a signature-shaped `Type` like `FunctionType`/`ConstructorType`), the
interface an instance member is declared on; `impl` names a VALUE — a fully-qualified
`<package>:<Name>` export; `member` is the member name, shared by both member shapes. Both `type`
and `impl` deserialize through the same strict reference grammar (a Go mirror of the TS `Type`
model's `ImportedType` shape — `name`/`from`/generic `typeArgs`); a missing package qualifier or any
other malformed reference is a loud load-time failure, never a silent skip.

There are three shapes:

- **Instance member** — `type` + `member`, with `impl` present when the member's declaration is
  ambient (a bodyless interface member — the body lives on `impl`'s `member`-named property; this
  is every member entry in the workspace today) or absent when the declaration IS its own body (a
  class method).
- **Static / namespace-const member** — `impl` + `member`, no `type` — the `impl` value is both the
  call-base anchor and the body holder.
- **Floater** — `impl` only, no `type`, no `member` — the `impl` function's own source is the body.
  `impl` is fully qualified even though it always self-references the declaring package
  (`"@rhombus-std/primitives.extras:registerAugmentations"` for the `registerAugmentations<R>()`
  sugar) — the side-parser only ever reads files inside that package, and a foreign `impl` is
  rejected at load time.

### The `"rhombus-std"` config, `"extends"`, and the default file

Every top-level key under a package's `"rhombus-std"` marker — `"inline"`, and any future feature
block — reads through one shared resolution step before anything else touches it. A config may
declare `"extends"` as a sibling of its other keys: one path, or an array of paths (each relative to
the file that declares them), to another rhombus-std-shaped file — JSON, YAML (`.yaml`/`.yml`), or
TOML (`.toml`), chosen by the target's extension. An array applies left to right — each path's own
resolved content deep-merges over everything accumulated from the paths before it, so a later path
wins a leaf collision against an earlier one. The whole accumulated result is this config's BASE:
the config's own keys deep-merge OVER it and win every remaining collision — a nested object
recurses key-by-key, and an array concatenates (the base's elements first, the winning side's
appended); an array's own elements are never merged into each other.

```jsonc
{
  "rhombus-std": {
    "extends": "./rhombus-std.json",
    "inline": {
      "entries": [/* … */],
    },
  },
}
```

`"extends"` resolves BLINDLY: a path that isn't a readable file contributes nothing, silently — no
diagnostic, whether the directive was written by hand or supplied by the default below. A chain may
be arbitrarily long (an extended file may itself carry `"extends"`); a cycle — a path already
reached earlier in the same chain — also contributes nothing rather than looping. A present file
that fails to parse in its own format is a hard load-time failure — blindness covers absence, not
corruption. A YAML or TOML value normalizes onto the same data model a JSON file already produces
before anything downstream sees it: a YAML timestamp scalar or a TOML date/time value both render as
an RFC3339 string (or the equivalent partial ISO 8601 text for a date-only or time-only TOML value)
rather than a native date type, and a YAML mapping key that isn't already a plain string is forced to
one.

A `package.json` with no `"rhombus-std"` key at all resolves as though it had written exactly
`{ "extends": "<the first sibling default file that exists>" }` — a FIRST-MATCH-STOP probe, not a
fold: `rhombus-std.json`, then `.yaml`, then `.yml`, then `.toml`, in that priority order, and the
moment one is found the rest are never even consulted, so two sibling defaults never cross-format
merge. A package with no marker of its own resolves to an empty config, silently, when none exist.
The moment `"rhombus-std"` is present with ANY value, including `{}`, the default probe never runs
at all: the package owns its whole config, and a sibling participates only through an `"extends"`
the package writes itself. An _explicit_ `"extends"` — written by hand, or reached partway down an
`"extends"` chain — keeps the full array fold described above regardless; first-match-stop is a
property of the implicit default alone.

Every resolved node — the `package.json` marker, each `"extends"` target, and the fully-merged
result — validates against `schema/rhombus-std.schema.json`. A node that doesn't match the schema is
a hard load-time failure naming the offending file and the JSON path the schema itself rejected.

### How matching works

**Declarations are claimed by ownership; calls are selected by the checker.** Each entry resolves
once per program: the type reference resolves to a module symbol, then to the exported type, and
then every type on that **surface** — the named one and each it transitively extends — is asked for
its own member of the entry's name. The union is the member's declaration set, and the subset whose
source files belong to the entry's **impl package** is what the body serves: a publisher declares
nothing onto a receiver that is not sugar, so owning package plus member name identifies the sugar
faces exactly. Ownership is package-level (the nearest enclosing `package.json` above the
declaration's file), so it answers identically for a package's `src` and for the rolled dist a
consumer resolves through. Argument-shape matching is deliberately NOT the criterion: one sugar
face can accept the very argument the primitive takes, and only the checker's own overload
resolution tells them apart.

Walking the surface rather than asking it for its `member` property is what makes the lookup
complete. A property lookup answers with one declaration set per name, and an interface that
reaches two same-named members through two `extends` clauses keeps one and hides the other — which
is exactly the shape a receiver takes when an abstractions package and its authoring package each
contribute a member map. Ask for the property and a declaration can be invisible; walk the surface
and it is always found. An entry naming a member that exists nowhere on its surface is a
**load-time failure**, never a skip.

**Bodies pair with faces per overload.** A body carrying its own declared signature serves the one
owned face spelling it exactly (type-parameter count, value parameters by name and order, `this`
excluded); a rest-shaped body blankets every owned face no exact-signature body claims.
Registrations accumulate in any partition — one marker call may supply a single overload's body,
several, or all of them, and further calls may add more; the unit is the (member, overload
signature) pair regardless of which call carried it. The pairing must be complete in both
directions, loudly: an owned face no body serves is a hard error (the call typechecks, nothing
inlines it, and it dies at runtime), as is a body no owned face declares (unreachable — no consumer
can name it), and two bodies claiming one face.

**Selection is the checker's resolution, full stop.** The signature the checker resolved a call to
— the one the author's editor displayed — is the selection, and the stage inlines the body assigned
to exactly that declaration. The engine performs no overload resolution of its own: a call
resolving to a declaration outside the assigned set (a runtime overload, a stranger's same-named
member) passes through untouched, and the resolution-time pairing above already guarantees every
publisher-owned face a body, so nothing ever falls back to a nearest match.

Two hard build failures keep a drifted install honest: a **rogue-duplicate** check when a call
resolves to a same-named member outside the entry's set on an unrelated copy of the interface (dist
skew, two physical copies), and an **emit sweep** that fails the build if any primitive or
listed-sugar call survives to the output un-lowered. The sweep tests against every entry whose
surface the program carries — including one whose sugar declarations turned out to be missing, which
is the case where nothing could lower and every call is therefore residue; a rest-bodied entry's
shape accepts any argument count from its required lead upward.

### Authoring rules (lint-enforced)

An inlineable body (`libraries/*/src/inline.ts`) must be exactly one `return <expr>;`, where the
expression is a single compile-time expression: no logical operators, assignments, comma
sequences, `await`/`yield`/`new`, or nested functions. A conditional expression (`?:`)
**is** permitted — it is still a single compile-time expression over otherwise-clean operands.
Each value parameter may appear at most once in a runtime position (unlimited inside a primitive
call's arguments); type
parameters may appear only as the whole type argument of a primitive call; every other free
identifier must be a parameter, `this`, a type parameter, or an unaliased primitive import. The
`rhombus-inline` ESLint rule enforces this for the published bodies — JSON-listed and
marker-discovered alike — including which package each primitive name is allowed to be imported
from (its one authoring home, per the table above).

Two splice tokens let one body forward an argument set as a group, each spread inside a call's
argument list: a **trailing rest parameter** holds the arguments past the named ones, and
**`arguments`** stands blindly for the whole set in call order, needing no declared parameter at
all. Leading named parameters keep binding positionally, so a body may reorder or interleave them
around the group; a zero-argument call splices an empty group with no special case. Both the spread
call form — `return (this.add as any)(typefor<T>(), ...args);` — and the `.apply` form —
`return this.add.apply(this, [typefor<T>(), ...arguments] as any);` — are supported and emit
identically: the assertion drops, the array collapses into the argument list, and the receiver is
written exactly once, so the lowered call is the one a hand author writes. A rest body is one
authoring choice among several — per-overload bodies with their own signatures are equally
first-class, and nothing requires a rest.

### Termination: the emitted call binds a different overload

A sugar body ends in a call to the same member name it sugars, so what stops the fixed-point loop
from lowering its own output forever is stated, not incidental: **the emitted call must bind a
different overload than the sugar face** — the loop's matcher resolves the emitted call, finds it
bound to a token-taking runtime overload no entry claims, and leaves it alone. The derived
arguments are what move the binding: `describe<T>()` emits `describe(typefor<T>())`, one argument
longer than its face; the uniform `add<T>(implementer)` emits
`add(typefor<T>(), implementer, typefor(implementer))`, two arguments longer — the service type
and the implementer type are both derived. Adopt this as the rule for any new type-taking
primitive: give the sugar a face whose lowering binds an overload the sugar's own face can never
re-match, and termination needs no further argument.

### Steering the observed implementer type with a cast

`typefor(value)` observes the checker's type for the **argument expression**, so a cast at the
call site is the supported way to steer the observed SHAPE: parameter rows, the return, an
overload row, a `Keyed<T, K>` slot naming a keyed registration the function's own parameters
cannot. What a cast can never change is the KIND — every type a callable is assignable to still
carries call signatures, so crossing the value/factory line would need a double assertion that
misdescribes the value. Kind is chosen by the door (`add` vs `addValue`, or the `ConstantType`
marker on the token form); shape is chosen by the cast. The cost to know at the call site: a
stale cast silently rewrites the injection list, because the derivation reads the cast, not the
callable.

### The body marker — `registerInlineBodies`

The marker call is the instance-member **discovery channel**: the stage reads the receiver from its
type argument and one entry per exported member from the set it names, so the statement beside a
body set is what publishes it — and, in the same stroke, the real reference that keeps the set from
reading as dead code:

```ts
export const ConfigBuilderInline = { withType<T>(this: IWithSchemaTarget): unknown {
  return this.withSchema(schemaof<T>());
} };
registerInlineBodies(ConfigBuilderInline);
```

It is the inline-body sister of the augmentation registry's `registerAugmentations` — a statement
next to the declaration that names its registered role — and it is a deliberate runtime **no-op**:
discovery reads it syntactically at build time, and the file it lives in is never bundled or
executed. It is imported from `@rhombus-std/primitives.extras` (authoring-time-only, and the one
package every body-carrying package already depends on).

**Beyond discovery, the marker also keeps the set visible.** The repo's mechanical dead-code scan
counts real references only — so without the marker a body set published by JSON alone is a
permanent known-false "unused export", in a scan whose whole value is that a finding means
something. The marker is a real reference, so the scan needs no exemption to stay honest here. A
set with neither a marker nor a JSON entry is simply unpublished: its bodies substitute nowhere,
and if a sugar face for it exists in the program the emit sweep reports the face loudly
(`INLINE_FACE_WITHOUT_BODY`) rather than letting calls survive un-lowered.

**Module level only, never wrapping the set.** The Go side-parser finds a set by its top-level
`const` declaration and its members by walking that declaration, and the body validator rejects any
identifier inside a body that is not a parameter, type parameter, or known primitive — the marker
included. Both the ESLint rule and the Go extractor pin this: a module-level call is clean, a
reference from inside a body is a free identifier.

**A barrel export is not a substitute for the marker.** A set exported by name from `src/index.ts`
already satisfies the dead-code scan, but the export publishes nothing — discovery reads the marker
call, so every instance-member body set carries one beside its declaration whether the barrel
exports it or not.

## The sugar bodies, family by family

Everything below is ordinary TypeScript, side-parsed by the inline stage out of each package's
source and never bundled or shipped — the body is substitution source, not runtime code.

### Registration (`di.extras`)

`di.extras`'s sugar bodies live in `src/augmentations/`, one file per receiver, and each file's
namespace does two jobs at once: the `declare module '@rhombus-std/di.core'` block below it merges
the generic `<T>()` signature onto the receiver, and the namespace's function declarations are the
bodies the inline stage side-parses and substitutes at a matching call site. There is no separate
authoring-only body file for this family. Every member is a `this`-based function that forwards its
arguments positionally to the same-named member on the real receiver — the only thing it mints is
the leading type argument, via `typefor<T>()`. Its parameters are all NAMED, because the
implementation is the declared face the stage matches a call against:

```ts
export namespace ManifestServiceAugmentations {
  export function addClass<T>(this: Manifest, ctor: Ctor<any[], T>, implementerType: ConstructorType, scope?: string,
    key?: string): Manifest {
    return (this as any).addClass(typefor<T>(), ctor, implementerType, scope, key);
  }
  // add / addFactory / addValue follow the same shape
}
```

A call that stops short of the optional tail — `services.addClass<ILogger>(ConsoleLogger, impl)` —
emits `services.addClass(TYPE, ConsoleLogger, impl)`: the arguments the call never wrote are
omitted rather than passed as `undefined`, which is what a hand author would have written.

`ManifestDescriptorAugmentations`, in a sibling file, carries the identical shape for `tryAdd`,
`tryAddClass`/`tryAddFactory`/`tryAddValue`, `replaceClass`/`replaceFactory`/`replaceValue`, and
`removeAll`. `ServiceProviderServiceAugmentations` puts the same pattern on a different receiver,
`IServiceProvider`, for members with nothing left to forward once the type argument is minted:

```ts
export namespace ServiceProviderServiceAugmentations {
  export function getService<T>(this: IServiceProvider): T | undefined {
    return this.getService(typefor<T>());
  }
  export function getRequiredService<T>(this: IServiceProvider): T {
    return this.getRequiredService(typefor<T>());
  }
  export function getServices<T>(this: IServiceProvider): Iterable<T> {
    return this.getServices(typefor<T>());
  }
}
```

### Options (`di.extras.options`)

```ts
export const ServiceOptionsInline = { addOptions<T>(this: IInlineOptionsTarget): Manifest {
  return this.addOptions(typefor<T>());
} };
```

The verb takes the bare `T` — `IOptions<T>` is never spelled here, because one open registration
answers every `IOptions<…>` request, so the sugar has only its own type argument to derive. That
keeps `addOptions<T>()` an ordinary single-type-argument `typefor` call, no different from
`addClass<T>()` or `add<T>()`.

### Config (`config.extras`)

```ts
export const ConfigBuilderInline = { withType<T>(this: IWithSchemaTarget): unknown {
  return this.withSchema(schemaof<T>());
} };
```

`schemaof<T>()` expands `T`'s member shape (casing, optionality, inline structures) into the same
`Type` tree `withSchema(Type.object({...}))` accepts by hand. Nothing about the walk is
config-specific: it is a domain-free "type → `Type` tree" engine, and the only identity it carries
is the runtime `Type` namespace object it spells the tree through, threaded as data (see
[Domain lives in TypeScript, not in Go](#domain-lives-in-typescript-not-in-go)). A member the Type
grammar has no spelling for (a callable, an anonymous structure with no nameable shape, an index
signature), or a non-object root, is a targeted diagnostic naming the construct, and leaves the
`schemaof<T>()` call un-expanded rather than emitting a wrong tree.

## Parse-anchoring: the checker only ever sees pass-0 syntax

A primitive stage anchors a call two different ways depending on where the call came from: a
**source-written** call (`typefor<IWidget>()`, typed by hand) resolves its callee symbol through
the checker directly; a **substituted** call (the same expression, freshly spliced in by the
inline stage from a sugar body) has no checker symbol of its own — its callee is a cloned node
from the body's source file, and the stage instead reads the type/value the inline stage already
bound and recorded in its **artifacts** (see below).

The rule for the first kind is one line: **anchor = checker input, current node = rewrite input.**
Before a stage asks the checker anything it resolves the node back to the **parse node** — the
pristine node the binder saw — and asks about that; the receiver and arguments it splices still
come from the current tree. `plugin.CheckerAnchor` is the helper, built once per file per pass:

```go
parseAnchor := plugin.NewCheckerAnchor(ec, sf)

call := parseAnchor.AnchoredCall(node)   // nil ⇒ minted, or a foreign-file clone: clean skip
if call == nil {
    return nil, false
}
symbol := checker.GetSymbolAtLocation(call.Expression)
```

`ec.ParseNode` walks the `EmitContext`'s Original links back to the parse node — the Go equivalent
of TypeScript's own `getParseTreeNode`, which transformers have always been expected to call before
consulting the checker. Two nodes get no anchor and are skipped: one a stage **minted** through
`factory.New*` (synthesized flag, no Original link), and one whose Original lands in a **different
file** — which is exactly the inline stage's deep-cloned sugar bodies, since the clone hook records
the side-parsed body node as the clone's original. Both belong to the artifacts path, so the two
mechanisms partition cleanly: a minted node has no parse anchor by construction, and the artifacts
path answers for the rest.

### Artifacts entries are not automatically pass-0 — anchor what you RECORD

It is tempting to read "the inline stage resolved this at the original call site" as "so it is
pristine". It is not. Substitution happens on whatever pass the inline visitor first **reaches** a
sugar call, and the visitor does not descend past a match — so a registration sitting in receiver
(or argument) position under another sugar call waits a pass, and the primitive stages rewrite
what is inside its arguments while it waits:

```ts
services.addValue({ clockToken: typefor<IClock>(), retries: 3 }) // waits: it is the receiver
  .addClass<IWidget>(Widget); // inlines on pass 0
```

On pass 0 the outer `addClass` substitutes and the receiver is spliced verbatim; also on pass 0
the typefor stage lowers the `typefor<IClock>()` inside that object literal, rebuilding the literal
through `factory.Update*`. Only on pass 1 does `addValue` substitute — and `callArguments(call)`
now hands back the **rebuilt** literal.

That matters for any artifacts field holding a **node** rather than a resolved type.
`PrimitiveUse.ValueArg` is the only one, and its consumer — the typefor stage's own value-argument
branch — hands it straight to the checker. Typing a rebuilt node resolves the enclosing call's
overloads, which contextually types the minted symbol-less literals downstream stages produced,
and `getContextualTypeForObjectLiteralElement` nil-derefs — the same crash parse-anchoring exists
to prevent, arriving by a route no matcher guard can see. So the rule extends: **anchor the node
you RECORD, not only the node you match.** `fileState.anchorValueArg` does that, pairing each
spliced argument with the pass-0 argument at the same index and falling back to the Original
chain; a shape with no parse node behind it records `nil`, every consumer reads that as "not a
registered value argument", and the emit sweep names the surviving primitive instead of the
process dying.

Anchoring costs nothing in expressiveness, because **every checker question this engine asks is a
question about source-written syntax** — which primitive is this callee, which overload does this
sugar call bind to, what type is this argument. None of those answers can change as the loop lowers
the tree underneath them, so asking about the pass-0 node is the question the stage meant to ask.
The stages that genuinely depend on rewritten state — `flattenSignatureForSpreads`' minted arrays,
the inline stage's `elideUnkeyedKeyArg` — use no checker at all. Repeat queries are cheap: the
checker memoizes per node, and the anchor makes every pass ask about the same node.

`mergesynth` is exempt only because of **where** it runs — a one-shot pre-pass before the loop
mutates anything, so its nodes are still pristine by placement. Its documented rejoin condition
(a sugar body that starts emitting install calls) has to take the anchor at the same time.

### Why the old synthetic-node guard was not enough

Each matcher used to carry a positional guard instead:

```go
if node.Pos() < 0 || node.Parent == nil {
    return nil, false // synthetic node — never a checker-anchored candidate
}
```

It caught a real bug — after the fixed-point loop landed, the inline matcher was re-matching **its
own already-lowered output** on the next pass. `.withSignature<[]>()` lowered correctly to
`.withSignature()` on pass 1, and on pass 2 the matcher tried to resolve that zero-arg call against
the sugar overload again; `RecoverTypeArguments` failed with no type argument to recover, and the
build failed with a spurious "inferred type argument" diagnostic despite a byte-correct emit. That
call was rebuilt fresh (`Pos() < 0`), so the guard on the **call** node stopped it — while a guard
on its _callee_ never fired, because the substitution clones the sugar body and preserves the
clone's foreign but still-non-negative positions. Parse-anchoring subsumes that case for a stated
reason rather than an accident: a `factory.New*` call has no Original link, so it has no anchor.

What the guard could never see is the node the checker walks to **answer**. A slot for an
**optional** (or defaulted) constructor parameter lowers to a union slot — the object literal
`{ union: [token, { value: undefined }] }` — minted through the emit factory, so it carries no
symbol. Then:

```ts
// authored: Widget's second constructor parameter is optional
manifest.addClass(Type.imported('Widget', 'pkg'), Widget, typefor(Widget))
  .addValue(Type.imported('IWidgetOptions', 'pkg'), defaultOptions);
```

Pass 1 lowers `typefor(Widget)` into that minted object literal. Pass 2 reaches the trailing
`.addValue(...)` call and asks the checker to resolve it. Answering means typing the receiver,
which means resolving the `addClass` overload, which means contextually typing the minted object
literal, and `getContextualTypeForObjectLiteralElement` dereferences the symbol it assumes every
element has:

```go
symbol := c.getSymbolOfDeclaration(element)                       // nil: the binder never saw it
return c.getTypeOfPropertyOfContextualTypeEx(t, symbol.Name, …)   // nil pointer dereference
```

The positional guard is structurally blind to this: `ast.updateNode` copies the original's `Loc`
and `Flags` onto a rebuilt node, so a rebuild keeps a real `Pos()` and loses the synthesized flag —
it looks source-written, because in every sense that matters it _is_. And the guard cannot be
widened to "skip any call whose subtree contains a minted node": the checker walks arguments too,
so that would strand the ordinary mid-loop state, where a sugar call legitimately sits over
already-lowered arguments. What the rebuild does leave behind is the Original link, which is what
the anchor follows.

It took **both** halves — a minted object literal in the argument list _and_ a later query over the
chain containing it. Either alone was always fine: a registration with nothing chained after it
lowers cleanly, and a constructor whose parameters are all required derives bare token strings with
no object literal to type. Both crashing shapes and both controls are pinned in
`transforms/internal/stdhost/syntheticnode_test.go`, asserting the lowered bytes (a repair that
merely stopped crashing while lowering _less_ would pass an exit-code check and fail those); the
anchor's own behavior — identity on a parse node, nil on a minted one, resolution through repeated
rebuilds, rejection across files — is pinned in `transforms/internal/plugin/anchor_test.go`.

**Adding a stage: use `Update*`, not `New*`, for a node the checker must still answer about.** A
`factory.New*` reconstruction gets no Original link, so it has no anchor and silently stops
matching; call `ec.SetOriginal` explicitly if a fresh build is unavoidable. And verify a new matcher
against a real `ttsc` build — a Go unit test over hand-built fixture nodes can pass while the real
pipeline's node shapes still break it.

Independently of all this, the whole per-file pipeline runs under a recover
(`stdhost.transformFileToTypeScript`), so any FUTURE engine panic arrives as a `STAGE_PANIC`
diagnostic naming the source file, the stage that was running, the recovered value, and the stack —
never as an anonymous Go trace on stderr. That net is the backstop for the next unknown crash, not
scaffolding for this one.

## The artifacts hand-off

The inline stage's per-run **artifacts** are how a substituted call — one with no checker symbol
of its own — reaches a downstream primitive stage at all. As the inline stage substitutes a body,
it walks the freshly-spliced expression and records every primitive call it finds, keyed by **node
identity** (not by name or position), against the checker-bound type or value from the _original_
call site:

- a **type-argument** primitive (`typefor<T>()`, `schemaof<T>()`) records the bound
  `*checker.Type` for each type parameter;
- a **value-argument** primitive (`typefor(value)`) records the original, program-bound argument
  node itself, so the consuming stage can still query the checker through it even though the
  primitive's own callee is synthetic.

A downstream stage (`typefor`, `schemaof`) checks the artifacts map first
for any call it visits; a hit means "this is my
substituted work from this run," a miss falls through to the ordinary checker-anchored
source-written path. After the loop's final pass, an **emit sweep** walks the artifacts one more
time and fails the build if anything registered there — or any listed sugar call — survived
un-lowered into the output. That sweep is the tripwire that would catch a stage silently failing
to claim work it should have.

## Failure semantics: a diagnostic, never a silent empty tree

Every type-shaped primitive follows one rule: an **underivable** derivation (an anonymous type
with no export name, a type the checker can't resolve, a base type that isn't in the program)
never emits an empty string, `null`, or any other silent placeholder. It either:

- leaves the call **un-lowered** with no diagnostic, if the failing use is a _synthetic_
  (substituted) one that hasn't reached the sweep yet — a later pass may still resolve the state
  it depends on, and erroring before the loop settles would fail builds that are actually fine; or
- emits a **targeted diagnostic** naming the specific problem, if the failing use is
  _source-written_ (a human wrote `typefor<AnonymousType>()` directly) — where there's no later
  pass that could still rescue it.

The sweep is the backstop for the first case: a synthetic use that never settled and never got
lowered is exactly what the sweep exists to catch. Nothing in the loop ever silently succeeds with
a wrong or empty answer.

A **panic** inside the per-file pipeline is held to the same standard. The whole pipeline runs
under a recover, and a crash — in a stage, the emit sweep, or the printer — becomes a
`STAGE_PANIC` error diagnostic carrying the source file, the phase that was running, the recovered
value, and the stack, after which the run **aborts**: the panic escaped the shared checker, whose
resolution bookkeeping is left in an indeterminate state, so every later file's lowering would be
untrustworthy and lowering that is quietly wrong is worse than none. A panic outside the per-file
loop — the dependency scan, program load, the linked-plugin handoff — has no file to name and is
reported on stderr as `HOST_PANIC` against the host itself. Either way the process exits non-zero
with something to report, never with a bare runtime trace.

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

- **The re-match guard, then parse-anchoring** (see
  [Parse-anchoring](#parse-anchoring-the-checker-only-ever-sees-pass-0-syntax) above) — the
  fixed-point loop's own re-matching of its prior pass's output was the first concrete proof that
  keeping the checker off the loop's own output needed to be an engine-wide rule, not a per-stage
  judgment call. The positional guard that answered it turned out to cover only the node a matcher
  HANDS the checker, not the nodes the checker WALKS TO, and a minted union slot in a chained
  registration crashed the process through the second route — which is what replaced the guard
  with the parse anchor.
- **The `addValue` raw-type split** — an early single-primitive design for the no-type-arg
  self-registration forms used the _produced_-type derivation (`tokenfor(value)`) for `addValue`
  too, which silently diverged from the by-hand form for a function-valued `addValue` (it would
  derive the function's _return_ type instead of the function's own type). The fix split
  `tokenof`/`tokenfor` into distinct raw-vs-produced primitives rather than trying to make one
  primitive branch on which verb called it — keeping the domain-neutral primitive genuinely
  domain-neutral meant the _verb_ (registration-body-side knowledge) has to pick which primitive
  to call, not the primitive guessing at its caller.
- **The keyed-semantics fix (§98)** — a resolve body that derives its token with `tokenfor<T>()`
  strips a `Keyed<T,K>` brand — silently matching the _wrong_ (unkeyed) registration, or matching
  nothing, for a keyed lookup. The fix routes a keyed consumer through the raw-preserving
  `tokenof<T>()` instead, so a keyed resolve actually round-trips a keyed registration.
- **The transitive-witness fix** — a consumer reaching a sugar-target module only _transitively_
  (importing `@rhombus-std/di` without importing `@rhombus-std/di.core` directly, even though
  `di`'s own bundle re-exports it) could make the inline stage's module-resolution check return
  "absent" and go inert for that consumer's whole program, even though every sugar call in it
  would otherwise have lowered correctly. The fix adds a module-_resolution_ fallback (asking the
  program to actually resolve the specifier, not just scanning for an existing specifier AST node)
  behind the specifier scan, so a re-exported-but-not-directly-imported module still counts as
  present.
