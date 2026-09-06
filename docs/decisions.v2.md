# Decisions (v2)

**NOT gospel.** Claude's own decision log — the owner's record is `decisions.user.md`, and only that
file grounds architectural choices. Claude writes here freely, without asking: its own calls, working
positions, material for arguing a case with the owner. Each entry keeps its `§N` id so citations
across the codebase resolve here. No entry overrides another — correct the original in place (for a
`decisions.md` entry: strike it there, author the corrected entry here) — and every entry speaks only
of the present, so the doc reads the same in any order. di2 decisions stay distinct from di. Kept
terse on purpose — this doc is primarily for Claude's use.

---

## §93 — config keeps its hand-rolled `Schema`; zod not adopted

config's schema system (`Schema`/`Infer`/`coerce`, a hand-rolled zero-dependency set for
string-to-scalar config coercion) stays; zod is not adopted, at either the runtime or the transform
layer. Adopting zod would pull a runtime dependency into a foundational package, change the public
API shape (a `z.object(...)` schema instead of a plain object literal), and shift coercion semantics
away from config's strict parsing rules — and zod's strengths (refinements, unions, custom errors) go
unused by config's narrow job. A dependency-free schema can move to wherever it's needed; zod cannot.

## §101 — Certified bodies are direct-over-primitives; no nesting

A certified inline body may compose authoring-only primitives and explicit runtime verbs, but may not
call other sugar — there is no recursive expansion, and the manifest reserves no field for it.
Cross-package composition happens at runtime instead, through ordinary function calls: a family's
registration helpers are themselves runtime members, and any sugar those helpers use lowers at their
own declaring package's build, not at the call site that invokes them. Adding nesting later is
additive, not a breaking change to the grammar.

## §102 — API placement follows which package owns the concept; a runtime package wholesale re-exports its own core

Where an API lives is decided by which package owns the concept, not by whether the target package
happens to emit runtime — a `*.core` package is the abstractions home even when that means it ships a
JS bundle. Three rules follow: a runtime package wholesale re-exports its own family core
(`export * from '@rhombus-std/<family>.core'`), so its public surface stays a strict superset of the
core's, and where a name is defined in both, the runtime package's explicit local export wins over the
`*` re-export. In-repo library source imports family abstractions from the `*.core` specifier
directly, never through the runtime package's re-export — the wholesale re-export is a consumer
convenience, not an internal dependency path. And section-vs-root discrimination for config goes
through a branded guard: `config.core` exports a unique-symbol brand that `ConfigSection` stamps on
itself plus an `isConfigSection` predicate that reads it, because TypeScript interfaces erase at
runtime and structural duck-typing can't tell a root from a section sharing the same public shape. The
brand lives in the shared core so the symbol is identical everywhere.

## §107 — ttsc plugin cache is shared on disk; e2e sandboxes are per-worktree

ttsc's plugin cache is content-keyed, so it lives in one shared, disk-backed location rather than
per-workspace-root — a version skew is just a different key in the same store. Every e2e suite and the
main build point their cache/build-scratch env vars at that shared home so the cold sidecar compile and
Go's object cache are paid once per machine, not once per suite or worktree. Each throwaway e2e sandbox
must still sit outside any enclosing `package.json`: ttsc derives a fixture's tokens relative to the
nearest package root, so a sandbox nested under the monorepo re-roots local tokens as members of the
monorepo package instead of the package-less form the parity corpus expects.

## §110 — Primitive naming: `-for` mints an identity, `-of` observes an existing one

A primitive's suffix says which half of the job it does: `-for` mints an identity for a type nothing
has stated yet (`typefor<T>()` mints `T`'s address), and `-of` observes something the target already
carries (`schemaof<T>()` reads out the members `T` already declares). A new primitive's name follows
this convention.

## §125 — Overlapping open registrations are NOT ranked by specificity; the registry resolves them by registration recency

Overlapping open (generic) registrations are not resolved by specificity. When two open registrations
both match one request, the engine picks the more recently registered one — the same recency rule that
orders every other registration — never the one that binds fewer holes. Registering a specific template
first and a general one second silently resolves through the general one on a matching request; there
is no specificity ranking to catch this.

## §130 — A library references the abstractions package; only an entry point references the engine

`logging` is the one library allowed a runtime dependency on the `di` engine, not just `di.core` —
`LoggerFactory.create` composes a manifest, builds it into a provider, and resolves the factory out of
it, which is entry-point work happening inside a library. It stays, as a legitimate convenience for a
consumer who wants logging without composing a container of their own. The exception is `logging`, by
name, and the list is closed: no other library may build a container, and a second exception requires a
new decision here rather than an argument that some new case resembles this one — stating it as a name
rather than a shape is deliberate, since a shape invites every author to decide their own case
qualifies.

## §132 — An undeclared surface is worse than an unimplemented one

A public member whose semantics are undecided is still declared: a signature predicted from existing
types, a body that throws `NotImplementedError`, and nothing else. An absent member blocks every
consumer, test, and lowering that names it; a runtime throw does not. The scaffold rule has three
edges: predict the correct form but never block on the prediction, create no new types without the
owner's signoff, and keep every scaffold additive.

## §140 — Contextual `this` typing has one exception; the augmentation inventory is discovered two ways

A tool that enumerates a codebase's augmentations — a lint rule, a scan, mergesynth — counts two
independent sources: `registerAugmentations` call sites, and any namespace a `declare module` block
merges onto a receiver via `extends Flatten<typeof Ns>` with no accompanying register call. Missing
either source undercounts the inventory.

## §150 — A type wears at most one tag

A tag type's inner type excludes `TagType` itself, so a type carries at most one tag; the type system
refuses a tag over an already-tagged type wherever the base is statically known, and the interning path
and token reader refuse the rest at runtime. This rejects re-keying: a keyed registration composes its
key into the address, so silently replacing or nesting a key would file a registration under an
address neither side named, surfacing a miss far from its cause.

## §169 — The token grammar spells overload rows with semicolons, inside the one parameter position

The token grammar spells a callable's overload rows with semicolons inside the existing parenthesized
position: `(A, B) => R` is one row, `(A, B; A) => R` is two, and a leading `;` spells a leading empty
row. Because the separator sits inside the existing position, a one-row callable's token is unchanged
from a non-overloaded spelling — only a genuinely overloaded callable's token grows the `;`.
`Type.stringify` always emits the arrow form, never the reserved `Func<...>`/`Ctor<...>` spelling. The
reserved spellings carry rows the same way: `Func<R, A, B; C>` names two rows over return type `R`, and
`Ctor<I; A>` — no comma before the `;` — spells a leading empty row (the constructor's own
no-argument overload) followed by `[A]`.

## §173 — The envelope carries the consumer program's own TypeScript diagnostics, collected once

The Go host runs the consumer program's own checker once, program-wide (`Program.Diagnostics()`, right
after `ApplyLinkedPlugins`, before the per-file stage loop) rather than per file, so a real type error
is reported once rather than once per file and never silently dropped by the always-on force-emit. Each
diagnostic is filtered to errors only and rendered with a `"TS" + numeric code`, matching `tsc`'s own
display convention and staying disjoint from every stage's own string diagnostic codes.

## §175 — The implementation IS the declared face the inline stage matches against

An inline sugar body must match its declared face exactly — same type-parameter count, same value
parameters by name and order — because face and body are one node. A body that absorbed its parameters
into a bare rest has no face to compare against, so it would serve any declaration of the same arity
including one it has nothing to do with; since nothing in the call, declaration, or body can tell a
coincidental arity collision from the genuine target, no inline implementation is allowed to take a
bare rest — it's refused where it's read, naming the member. A genuinely variadic member instead keeps
a leading named parameter ahead of the trailing rest, which only serves an identically-spelled
declaration.

## §179 — Callable nodes drop their dead quantifier list and the `Type` suffix

`ConstructorType` and `FunctionType` carry no `genericArgs` member — generic binding happens by
tree-position unification against the holes themselves, so nothing at a callable's request site needs
to spell "populate these holes ahead of matching." The member lives only on the identifier kinds
(`GlobalType`/`ImportedType`), where it's a real positional constructed-argument list.
`ConstructorType.instance` and `FunctionType.return` carry the bare property name, dropping the
redundant `Type` suffix; `return` is a legal property name but not a legal bare identifier, so the
positional `Type.func` factory's first parameter is spelled `returns`. The typefor accessor-folding
peephole recognizes these property names, so `typefor(C).instance` or `typefor<F>().return` still fold
at compile time.

## §181 — An abstract constructor is its own kind

`AbstractConstructorType` (`kind: 'abstract-ctor'`) is a distinct node from `ConstructorType`, each
carrying only `instance` and `signatures` — no flag member anywhere. A slot that must be able to
construct spells `ConstructorType` and refuses the abstract kind by plain assignability; there is no
runtime check backing the refusal, since admissibility is type-only. Matching stays identity-modulo-holes
between the two: an abstract pattern answers only an abstract subject, with no flag comparison. The
token grammar spells the kind with a leading `abstract` keyword recognized only immediately before
`new (`, so `abstract` still reads as an ordinary global type name everywhere else.

## §183 — The signature-level abstract flag needs an upstream `ttsc` change, not a consumer-side hook

Deriving an abstract-constructor type from a bare type literal with no backing class declaration needs
the checker's own `SignatureFlagsAbstract`, which the `ttsc` shim doesn't currently alias. Adding it
requires a change inside `ttsc`'s own source repository (its shim-generation tooling runs there,
against its own checkout, to produce what ships in the npm package) — there is no hook this repo's
build invokes, so closing this gap needs an upstream `ttsc` contribution or a standing fork, not a
change on the consuming side.

## §189 — The compile-time type machinery is the toolkit's; `obj` carries the `Object.*` precision

`@rhombus-std/primitives` carries no type-level module of its own: `Flatten` is imported from
`@rhombus-toolkit/types`, and the precise `Object.keys`/`values`/`entries`/`assign`/`fromEntries`
result types live on `@rhombus-toolkit/obj`'s `obj` module as opt-in wrapper functions, with no
`ObjectConstructor` global augmentation anywhere. A call site that never needs the precision keeps the
stock `Object.*` statics.

## §192 — Exports go src-first in-repo; dist is the published surface only

Every library's dev exports resolve `./src/index.ts` for every consumer and every condition;
`publishConfig` carries the dist surface unchanged for publish. This makes editor resolution (rename,
find-refs, go-to-def) build-independent, since no in-repo program ever resolves `dist`, and gives the
dependency graph exactly one resolution plane, so type and value identity — one `Manifest`, one
augmentation registry, one module instance per package — hold everywhere without a bundle-vs-source
dual plane to keep in sync. Since about two-thirds of the libraries call `typefor<T>()` at module top
level, raw source needs to be lowered at load time: a preload registers one bun plugin that dispatches
each loaded file to its owning library's `ttsc` project and passes every other file through unchanged,
with generated per-package `bunfig.toml`s carrying it into `bun run`/`bun test`. The `./private/*`
white-box seam maps straight to source and is scrubbed from `publishConfig.exports`; a consumer program
compiling a dependency's source also picks up that dependency's own ambient typings and
`declare module` faces, so a package's gate compiling its transitive dependency source is how an
upstream break surfaces downstream.

## §231 — A named or tagged type never falls back to member synthesis on a registration miss

A named type resolves only through a registration and never falls back to composing from its own
members, because treating a miss as a cue to decompose would reintroduce assignability by another
route. The tag kind carries this to its edge deliberately: a container never synthesizes an
unregistered tagged address from its inner type, since that would let a keyed address quietly resolve
to the unkeyed service instead of failing loudly.

## §232 — The transformer's node vocabulary mirrors the `Type` union, member for member

The Go transformer emits `Type` expressions from exactly one node vocabulary, matching the `Type`
union member for member, so a container's slot can be any kind without a poorer half to fall into.
Because only one vocabulary exists, a derivation refusal always means the same thing — this shape has
no `Type` member that can express it — never a silent gap between two overlapping classification
schemes.
