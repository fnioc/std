# Transformer architecture

`@rhombus-std/di.transformer`, `di.transformer.options`, `config.transformer`, and
`primitives.transformer` each rewrite TypeScript at compile time — `tokenfor<T>()`, `addClass<T>()`,
`addOptions<T>()`, `withType<T>()`, `keyof<T>()`, and friends. What each rewrite actually _does_ is
documented on its own package (see each package's README). This doc covers the machinery
underneath all four: how they run in your build, how they share one native compiler backend, and
how that backend decides which stages to run for you. It's written for anyone installing and
wiring these packages into their own project; the last section is for people working on this
repo's own transformer sources.

## One engine

There is a single transform engine: a Go binary running through `ttsc`, built on
[`typescript-go`](https://github.com/microsoft/typescript-go)'s compiler internals instead of the
JS TypeScript compiler. An older ts-patch/TS5 track existed alongside it; it's gone, tagged at the
restore point `pre-tspatch-removal`. Lint and typecheck are plain `tsc --noEmit` — no plugin at
all.

That works because every sugar form is declared twice, in two different senses:

- **A throwing stub**, so a call that somehow reaches runtime without being lowered fails loudly
  instead of silently doing the wrong thing:

  ```ts
  // @rhombus-std/primitives — the real declaration; the body throws so a
  // call that reaches runtime un-lowered fails loudly instead of returning undefined
  export function tokenfor<T>(): string {
    throw new Error(
      'tokenfor<T>() requires the transformer, or pass an explicit token.',
    );
  }
  ```

- **A phantom type** — usually a `declare module` augmentation onto the receiving interface (e.g.
  `IServiceManifestBase.addClass<T>()`) — which is what makes the tokenless forms typecheck at all.
  That's ordinary TypeScript; no plugin is needed to see it, only to get the declaring file into
  your program (see [Wiring](#wiring-a-transformer-into-your-project) below).

The build track lowers the exact same source through the Go engine, and the guarantee that matters
is parity: a lowered call produces **exactly what the manual form would have produced**, token
strings byte-for-byte. `tokenfor<IWidget>()` lowers to a string literal like
`"@fixture/consumer/tokens/app:IWidget"`; a hand-written `tryResolve("@fixture/consumer/tokens/app:IWidget")`
and the sugar form are indistinguishable after lowering. You can typecheck against the phantom type
and build through the Go engine and never see a mismatch — the `tests/*.ttsc.e2e` suites and the
example app's output diff exist to enforce exactly this.

## Wiring a transformer into your project

In the common case, wiring is one line: depend on the `*.transformer` package for the sugar you
want.

```jsonc
// package.json
{
  "devDependencies": {
    "@rhombus-std/di.transformer": "^10.0.0",
  },
}
```

You still need two tsconfigs, because typecheck and lowering are different concerns run by
different tools — but the lowering one is nearly empty:

```jsonc
// tsconfig.json — your normal config. Plain tsc sees the phantom `declare module`
// augmentation through the `types` array (tokenfor itself needs no entry here — it's an
// ordinary declaration in @rhombus-std/primitives — but the tokenless addClass/addFactory/
// addValue forms are a merge onto di.core's interface, and TS only applies a merge for
// a file actually pulled into the program).
{
  "compilerOptions": {
    "types": ["@rhombus-std/di.transformer"],
  },
}
```

```jsonc
// tsconfig.ttsc.json — marks this package for lowering. Its EXISTENCE is what matters,
// not its plugins list: leave `plugins` unset and the stages you need activate on their
// own (see "Declare-by-depending" below). An explicit list is the exception, not the
// default.
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
  },
}
```

That's it — no `plugins` entry naming `@rhombus-std/di.transformer/ttsc`, and no separate entry
for the `nameof`/`signatureof` stages your sugar happens to need underneath. Depending on
`di.transformer` is the whole signal.

### When you need an explicit `plugins` entry

Two cases still want one:

- **A bare, non-workspace project.** The automatic half of stage selection (below) walks your
  workspace's dependency graph starting from a `package.json`; outside any workspace there's
  nothing to walk, and selection falls back to whatever `tsconfig.ttsc.json` names explicitly.
- **A preset** — one descriptor standing in for an ordered set of stages, without taking on the
  package that would otherwise pull them in as a side effect. See
  [Presets](#presets-one-descriptor-for-a-whole-stage-set).

```jsonc
// tsconfig.ttsc.json — explicit form
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "plugins": [{ "transform": "@rhombus-std/di.transformer/ttsc" }],
  },
}
```

Listing a transform yourself always wins — it's additive with, not a replacement for, whatever the
dependency scan would have selected on its own.

## Declare-by-depending: how stage selection actually works

Selection happens in two layers. They run at different times and answer different questions, so
it's worth keeping them apart.

**Layer 1 — does a host get spawned at all?** This is stock `ttsc`'s own auto-discovery, and it's
direct-dependency-only: it looks at your project's own `package.json` for a
`"ttsc": { "plugin": { "transform": "..." } }` marker. Every `@rhombus-std/*.transformer` package
carries one, so depending on any one of them is enough to get a host running. This layer doesn't
decide _which_ stages run — only whether the process starts, and which single native backend it
resolves to.

**Layer 2 — which stages actually run?** Once the host is running, it does its own dependency walk
from scratch (`inlinetransform.CollectProject`, §100) and self-selects the full transitive stage
set from what it finds — independent of which single descriptor happened to spawn it. Concretely:
`primitives.transformer`'s own `./ttsc` descriptor hardcodes the name `rhombusstd_nameof` (just
enough to satisfy layer 1), while that package's `package.json` separately declares
`"ttsc": { "stages": ["inline", "nameof", "signatureof", "keyof", "mergesynth"] }` — the field
layer 2 actually reads. The descriptor's name and the package's real contribution to the stage set
are two different things.

### The marker

A `*.transformer` package declares the stage ids it contributes in its own `package.json`:

```jsonc
// libraries/di.transformer/package.json
{
  "ttsc": {
    "plugin": { "transform": "@rhombus-std/di.transformer/ttsc" },
    "stages": ["di", "valueof"],
  },
}
```

```jsonc
// libraries/primitives.transformer/package.json
{
  "ttsc": {
    "plugin": { "transform": "@rhombus-std/primitives.transformer/ttsc" },
    "stages": ["inline", "nameof", "signatureof", "keyof", "mergesynth"],
  },
}
```

The marker lives on the `*.transformer` package, **never** on a `*.core` package. A core (`di.core`,
say) is a dependency of nearly everything, including consumers who never touch the sugar forms at
all — a marker there would force a Go build onto every one of them. `di.core` itself carries no
`ttsc.stages` field; it only exposes a preset (see
[Presets](#presets-one-descriptor-for-a-whole-stage-set)).

### The scan

`CollectProject` walks the workspace dependency graph starting at the nearest `package.json` above
your build's working directory:

- **dependencies ∪ peerDependencies, at every package the walk reaches** — followed transitively,
  arbitrarily deep, deduped by directory.
- **devDependencies, at the root consumer only** — never inherited from a transitive dependency. A
  library's own devDependency on its own transformer (`di.core` devDeps `primitives.transformer` to
  lower _itself_) is that library's own build tooling, not a signal that every consumer of that
  library wants a Go build too.

One walk does double duty (§100): the same traversal that collects stage ids also collects every
reachable package's `rhombus.inline` publish-list entries — the
[inline stage](#the-generic-inline-stage-rhombusstd_inline)'s sugar bodies — so a consumer reaching
a transformer transitively gets both its stage and its inline bodies with no separate wiring.

Outside any workspace — no `package.json` findable above the build directory — the scan returns
empty and selection falls back purely to whatever `tsconfig.ttsc.json` names explicitly. Nothing
about that fallback is silent: if the scan is empty **and** the manifest is empty **and** no
foreign plugin is linked in, the build fails loudly —

```
NO_STAGES: no rhombusstd_* stage selected (empty manifest + empty dependency scan) and no
linked plugins present — this run would load the program and emit it unchanged; check that
the package reaches a @rhombus-std/*.transformer dependency
```

— rather than silently emitting your program unchanged. An unrecognized stage name, from either
the scan or the manifest, fails the same way (`UNKNOWN_STAGE`, naming the offending id).

### Seeing it work

Two fixtures make the transitivity concrete, driven through the real `ttsc` with **no** `plugins`
array in either one's `tsconfig.json`:

- A consumer that devDeps `di.transformer` (whose own `stages` field is just `["di"]`) and calls
  `tokenfor<IWidget>()`. Auto-discovery spawns the host off `di.transformer`; the host's own scan
  then reaches `primitives.transformer` _through_ `di.transformer`'s dependency on it, activates
  the `nameof` stage, and `tokenfor<IWidget>()` lowers to its token.
- A consumer that depends on **only** `di.core`. `di.core` carries no marker, so no host spawns at
  all — `tokenfor<IWidget>()` survives in the output untouched, even though `di.core` itself devDeps
  `primitives.transformer` to build itself. That devDep doesn't leak onto `di.core`'s own
  consumers.

`tests/declare-by-depending.ttsc.e2e` is exactly this pair, and is the suite to read if you want to
see the whole thing driven end to end against the real toolchain.

## Presets: one descriptor for a whole stage set

A core can still offer its sugar's stage set as one descriptor, for a consumer who'd rather not
rely on the dependency scan — a bare non-workspace project, or one that wants the stages without
also taking on the authoring package that would otherwise pull them in. `di.core`'s `./ttsc` export
is exactly this: naming it resolves to the bundle name `rhombusstd_di_bundle`, which the host
expands into its ordered constituents —

```jsonc
{
  "rhombusstd_di_bundle": [
    "rhombusstd_inline",
    "rhombusstd_nameof",
    "rhombusstd_signatureof",
    "rhombusstd_keyof",
    "rhombusstd_valueof",
    "rhombusstd_di",
  ],
}
```

— so a consumer of `di.core`'s type-driven `addClass<T>()`/`addFactory<T>()` sugar wires one line:

```jsonc
{ "plugins": [{ "transform": "@rhombus-std/di.core/ttsc" }] }
```

A preset is narrower than the full declare-by-depending reach, on purpose — this one excludes
`mergesynth`, `di_options`, and `config`, since those aren't part of what `di.core`'s own sugar
needs. It's the explicit opt-in channel; the default path (an in-workspace consumer just depending
on `di.transformer`) needs no bundle name at all.

## One binary, every stage linked in

Every `@rhombus-std/*.transformer` package's `/ttsc` descriptor — and every preset — resolves to
the same Go source (`transforms/cmd/ttsc-std`). That's deliberate:

- **One build.** The first project to touch it pays a cold `go build`; every descriptor after
  that, on the same cache, reuses the compiled binary.
- **One spawn per compile.** `ttsc` refuses to run two _different_ native backends over one
  source-to-source pass. Because every `@rhombus-std` descriptor names the same backend, that
  check trivially passes no matter how many descriptors are in play; a manifest entry that isn't
  one of this host's own stages and isn't a linked foreign plugin is rejected outright, naming it.
- **A hardcoded, canonical execution order**, regardless of manifest or dependency-scan order:

  ```
  inline → mergesynth → nameof → signatureof → keyof → valueof → di → di_options → config
  ```

- **Loud failure, not silent skip.** Selecting a stage neither the scan nor the manifest
  recognizes, or selecting nothing at all, fails the build with a specific message
  (`UNKNOWN_STAGE`, `NO_STAGES`) — never a quietly-incomplete transform.

This is why a consumer never needs one package per _combination_ of stages — no `di+options`
bundle, no `di+config` bundle. You compose stages by reaching them (through a dependency, or a
preset), not by finding a pre-built combination that happens to match your needs.

### The stage table

| Stage id      | Declared by              | What it does                                                                                                                                                                                                     |
| ------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inline`      | `primitives.transformer` | Substitutes a certified single-expression sugar body (§91) at its call site, before any primitive stage runs.                                                                                                    |
| `mergesynth`  | `primitives.transformer` | Synthesizes a default merge strategy for every augmentation member with none, from its own parameter types (§103, [below](#the-merge-synthesis-stage-mergesynth)).                                               |
| `nameof`      | `primitives.transformer` | Lowers `tokenfor<T>()` to its export-graph token, and elides the now-unused import.                                                                                                                              |
| `signatureof` | `primitives.transformer` | Lowers `signatureof<T>()` to a dependency-signature array, and the minting siblings `signaturefor<T>()`/`signaturesfor<T>()` (the `withSignature<T>()`/`withSignatures<T>()` sugar) to the same slot vocabulary. |
| `keyof`       | `primitives.transformer` | Lowers `keyof<T>()` to the key literal of a `Keyed<T, K>` type argument, or `void 0` when unkeyed (§98).                                                                                                         |
| `valueof`     | `di.transformer`         | Lowers `valueof<T>()` to its literal type's value — the `.as<Scope>()` sugar's scope argument.                                                                                                                   |
| `di`          | `di.transformer`         | Lowers the tokenless `addClass`/`addFactory`/`addValue` registration forms and the chain sugars (`.as`/`.withSignature`/`.withSignatures`).                                                                      |
| `di_options`  | `di.transformer.options` | Lowers the `addOptions<T>()` sugar.                                                                                                                                                                              |
| `config`      | `config.transformer`     | Lowers `.withType<T>()` into a generated `.withSchema({...})` runtime schema literal.                                                                                                                            |

`inline`, `mergesynth`, `nameof`, `signatureof`, and `keyof` are family-neutral — any family's
sugar can lean on them, so they're surfaced through `primitives.transformer` rather than
duplicated per family (§104). `di`, `di_options`, `config`, and `valueof` are each one family's own
stage, declared by that family's own `*.transformer` package. This split is also where each
primitive's _authoring_ home lives, independent of which stage lowers it: `tokenfor` stays in
`@rhombus-std/primitives` because it's the one primitive called from runtime source; `signatureof`
and `keyof` are typed against `di.core`'s real types, so their stubs live in `di.transformer` even
though the stage that lowers them is neutral (§92). `signaturefor`/`signaturesfor` are typed the
same way but produce `di.core`'s own `DepSlot`, so they're homed in `di.core` itself rather than
`di.transformer`; `valueof` is authoring-only (mints a literal-type value, not a di.core type) and
is homed in `di.transformer`, sibling to `keyof`.

`signatureof`, `keyof`, and `valueof` all run after `nameof` (disjoint call shapes — a
type-argument primitive vs. a value-argument one) and before `di`, so the `di` stage sees a
fully-lowered `addClass(...)` / `.as("x")` it leaves untouched.

## The generic inline stage (`rhombusstd_inline`)

Every other stage in the table above carries hand-written, per-family knowledge of one sugar shape
— `nameof` always lowers to a token, `di` always lowers a registration call. The **inline stage**
is different: it is a generic single-expression function-inliner that learns what to substitute
from a hand-authored publish list, not from compiled-in rules. Over time it replaces per-family
semantic knowledge — a library authors its sugar as ordinary typed TypeScript whose
single-return-expression body is written over the compile-time primitives, and the inline stage
substitutes that body at consumer call sites (the primitive stages then lower the result).

It is **workspace-only**: every entry it inlines resolves to a sibling package's real `src` file at
build time, in this repo, in this build. There is no published/carrier form of an inlined
function, no shipped src, no dist-JS resolution path — the external-consumption story is a
deliberately parked follow-up.

### The publish list — `"rhombus.inline"`

A library declares its inlineable members in a `"rhombus.inline"` key in `package.json`. This is
exactly what [the scan](#the-scan) above collects, in the same walk that collects stage ids (§100)
— reaching a package's inline entries needs no wiring beyond whatever dependency edge already gets
its stages activated.

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
    "import": "./inline-entries/more.json", // optional; string | string[], file-relative, composable
  },
}
```

The three fields map to TypeScript namespaces:

- `type` — a **type-namespace** export, written as a tokenfor token (`<package>:<TypeName>`,
  barrel-relative). The match anchor.
- `impl` — a **value-namespace** export in the declaring package that holds the body (self-relative,
  resolved to the package's real src).
- `member` — the member name, shared by the interface side and the impl side.

Kinds are inferred by field presence, into one of four grammar rows:

| Fields                     | Kind                  | Status                         |
| -------------------------- | --------------------- | ------------------------------ |
| `type` + `impl` + `member` | interface member      | **certified**                  |
| `impl` only                | free function         | **certified**                  |
| `type` + `member`          | class member          | specced, **not yet certified** |
| `impl` + `member`          | object-literal member | specced, **not yet certified** |

A free function has **no type-side anchor** — its module specifier is the owning package's own name
and its export is `impl`. The two uncertified rows are recognized so they can be rejected with a
distinct `INLINE_KIND_UNCERTIFIED` error rather than the malformed-shape error. Any other
field-presence pattern — a `type` + `impl` pair, a lone field, or a `member` == `impl` /
malformed-token violation of the interface-member row — is rejected loudly as `INLINE_ENTRY_SHAPE`.

### How matching works

Each entry resolves **once per program through the checker**: the type reference resolves to a
module symbol, then the merged member symbol — TypeScript's declaration merging has already unified
every `declare module` augmentation of the interface into that one symbol. A structural overload
discriminator (type-parameter count, value-parameter count and names, `this` excluded) separates
the sugar overload from the runtime ones. A call site inlines iff its resolved signature's
declaration is one the merged symbol carries and the sugar entry claims — by declaration identity,
never by string comparison. A same-named member on a duplicate copy of the interface resolves
outside the set and is caught by the rogue-duplicate tripwire.

### Authoring rules (lint-enforced)

An inlineable body (`libraries/*/src/inline.ts`) must be exactly one `return <expr>;` where the
expression is a single compile-time expression: no conditionals, logical operators, assignments,
comma sequences, `await`/`yield`/`new`/spread, or nested functions. Each value parameter may appear
at most once in a runtime position (unlimited inside a primitive call's arguments); type parameters
may appear only as the whole type argument of a primitive call; every other free identifier must be
a parameter, `this`, a type parameter, or an unaliased primitive import. The `inline-authoring`
ESLint rule enforces all of this.

### Tripwires

Two hard build failures keep a drifted install honest: a **rogue-duplicate** check when a call
resolves to a same-named member outside the merged symbol (dist skew / two physical copies), and an
**emit sweep** that fails the build if any primitive or listed-sugar call survives to the output.

## The merge-synthesis stage (`mergesynth`)

`rhombusstd_mergesynth` — the default-merge-strategy synthesizer for augmentations — is a base
stage of the one `ttsc-std` (folded into `internal/stdhost`'s base stage table, running before
`nameof`; decisions.v2 §103). For every member of a set reaching
`registerAugmentations`/`applyAugmentations` without a hand-authored strategy for its name, the
stage derives a runtime argument-shape guard from the member's own parameter types and threads a
per-member strategies map as the call's third argument — so a member-name collision dispatches by
argument shape instead of throwing. Hand-authored strategies always win (covered names are
skipped, and the original merge expression is spread last); an un-derivable parameter type
(`any`/`unknown`, a bare generic, no annotation) degrades to an always-pass strategy where that
extension wins and chain order breaks ties.

The guards are typia `createIs<T>()` validators generated **in-process**: the stage hands each
parameter's original type node to typia's native Go programmers over the same loaded program,
checker, and emit context, and inserts the already-lowered guard. Nothing typia-shaped survives
into the emit — a guard that would need a typia runtime helper import is dropped (with a warning)
rather than emitted.

The one `ttsc-std` links typia to run this stage (decisions.v2 §103, retiring the earlier
in-repo-only `ttsc-std-full` split). typia is a build-time-only cost: `ttsc-std` is a compiled
plugin binary, never shipped as runtime, and — because the emitted guards are inlined plain JS with
no typia runtime import — no typia reference reaches any published artifact or npm manifest (§87's
first-party-authoring ruling is untouched; only its typia-free-_binary_ consequence is retired).
`mergesynth` activates by declare-by-depending (§100): a package that depends on
`primitives.transformer` (whose `ttsc.stages` includes `mergesynth`) runs it, so every
augmentation-installing library gets synthesized strategies with no wiring; a package that installs
no augmentation runs it as a no-op and emits byte-identically.

## Why one pass, not a pipeline

`ttsc` runs a transform as a single source-to-source rewrite: it reads your original file once and
writes the rewritten file once. It could instead chain stages — feed stage A's _output_ into stage
B as its input — but that corrupts source maps. Each stage records the character offsets it
rewrote against the text it was given; if stage B ran against stage A's already-rewritten text, its
recorded offsets would point into that intermediate text, not your original file. Your editor's
"go to definition" and your stack traces would land on code that no longer exists anywhere you can
see it. Running every active stage inside one binary, over one loaded program, keeps every
recorded position anchored to the file you actually wrote.

The same reasoning ruled out a few other shapes:

- **Per-combination hand-authored hosts** (a package for `di+options`, another for `di+config`, …)
  — the combination space grows with every new stage; not tenable past two stages.
- **Family-partitioned hosts** (one binary per family: "di stuff," "config stuff") — just a
  coarser version of the same problem, and still forces a consumer wanting `di` + `config` into a
  host neither family owns.
- **Dynamic loading** (stages as `.so`/WASM plugins loaded into a shared host at runtime) — real
  ABI cost with no corresponding win here: build-once-run-anywhere collapses into a
  re-ship-per-toolchain-pin treadmill the moment `ttsc`'s pinned Go version moves.
- **Build-time generated hosts** (synthesize the combined binary's source per-project) — poisons
  the whole-module build cache and drags in `v0.0.0`-style local-module resolution nobody wants to
  maintain.

One binary, every stage linked in, activated by a runtime flag or a dependency scan — is the shape
that avoids all four.

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

The shared binary lives at `transforms/cmd/ttsc-std` and links every stage in the table above,
built from `transforms/internal/stdhost`'s `BaseStages()` (the ordered stage table — the slice
order **is** the canonical execution order) and `BaseBundles()` (the preset expansions, e.g.
`rhombusstd_di_bundle`). The command itself is a thin `main` that composes those into a `Host`
value and hands it to `stdhost.Run`; almost everything else — manifest parsing, the dependency
scan, stage selection, the per-file transform loop, and the JSON envelope `ttsc` reads back —
lives in `stdhost`, not the command.

Each `@rhombus-std/*.transformer` package's `./ttsc` descriptor is a thin JS module (`ttsc.mjs`)
that `ttsc` loads to resolve an absolute path back to `transforms/cmd/ttsc-std` plus a single stage
name; every descriptor resolves to that same directory, which is what lets `ttsc` dedupe them to
one cache key. The name a descriptor returns matters for auto-discovery (layer 1 in
[Declare-by-depending](#declare-by-depending-how-stage-selection-actually-works)) but not for which
stages actually run (layer 2) — `primitives.transformer/ttsc` names only `rhombusstd_nameof`, and
still contributes `inline`/`signatureof`/`keyof`/`mergesynth` once the host's own scan reaches it.

`selectStages` (`stdhost/host.go`) computes the union of the dependency scan's stage ids and the
manifest's `rhombusstd_*` entries (expanding any bundle name to its constituents), rejects an
unrecognized name from either source, and returns the result in the host's own table order — never
manifest or scan order. `CollectProject` (`internal/inlinetransform/collector.go`) is the scan
itself: it resolves each dependency name to an on-disk package directory (the workspace-root
`"workspaces"` glob map, falling back to `node_modules` — the bun isolated linker's symlinks make
both the real build and an e2e fixture resolvable this way) and recurses, reading each package's
`ttsc.stages` and `rhombus.inline` fields as it goes.

Adding a new stage means: write the Go transform under `transforms/internal/<name>transform`, add
its `Stage{Name: stagePrefix + "<id>", Build: ...}` entry to `BaseStages()` at the right position
in the canonical order, decide which package's `package.json` should declare
`"stages": ["<id>"]` (a `*.transformer` package if the stage is family-specific,
`primitives.transformer` if it's neutral, per §104), and give it a `./ttsc`-style descriptor if it
needs to be independently nameable.
