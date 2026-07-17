# Transformer architecture

`@rhombus-std/di.transformer`, `di.transformer.options`, `config.transformer`, and
`primitives.transformer` each rewrite TypeScript at compile time — `nameof<T>()`, `add<T>()`,
`addOptions<T>()`, `withType<T>()`, and friends. What each rewrite actually _does_ is documented on
its own package (see each package's README). This doc covers the machinery underneath all four:
how they run in your build, how they ship a native compiler backend, and why that backend is one
binary instead of four. It's written for anyone installing and wiring these packages into their
own project; the last section is for people working on this repo's own transformer sources.

## Two engines, one contract

Every transformer exists twice:

- **ts-patch on plain TypeScript** — your everyday `tsc`/editor-integration path. Fast, uses the
  TypeScript version you already have, and is what your IDE's language service sees. This is the
  lint/typecheck track: `tspc --noEmit`, ESLint, your editor's red squiggles.
- **A Go binary running through `ttsc`** — the build/emit track. It parses and rewrites the same
  TypeScript, but through [`typescript-go`](https://github.com/microsoft/typescript-go)'s compiler
  internals instead of the JS TypeScript compiler, and is what actually produces the JavaScript you
  ship.

Both tracks lower the exact same source to the exact same tokens — that equivalence (not the code
shape) is the load-bearing guarantee. If a `nameof<IUserRepo>()` call lowers to
`"pkg:IUserRepo"` under `tspc`, it lowers to that identical string under `ttsc`. You can typecheck
with one track and build with the other and never see a mismatch.

Neither track adds anything a hand-written call couldn't already do: a transformer only deletes
boilerplate — `add<IUserRepo>(SqlUserRepo)` in, `add('pkg:IUserRepo', SqlUserRepo, [[...]])` out —
never a capability the manual form lacks. Every package works, in full, with no transformer wired
at all; each package's own README shows the manual form its sugar rewrites into.

## Wiring a transformer into your project

Two tsconfigs, one extending the other — the **twin-config layout**:

- `tsconfig.json` — your normal config. Wires the ts-patch entries and stays your lint/typecheck
  gate.
- `tsconfig.ttsc.json` — extends it, swaps `plugins` for the `/ttsc` subpath of each transformer,
  and is what you actually build with.

```jsonc
// tsconfig.json — lint/typecheck
{
  "compilerOptions": {
    "plugins": [
      { "transform": "@rhombus-std/di.transformer" },
      { "transform": "@rhombus-std/di.transformer.options" },
    ],
  },
}
```

```jsonc
// tsconfig.ttsc.json — build
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "plugins": [
      { "transform": "@rhombus-std/di.transformer/ttsc" },
      { "transform": "@rhombus-std/di.transformer.options/ttsc" },
    ],
  },
}
```

**One `plugins` entry per transform stage you use** — there's no aggregate/combo package to reach
for. Want `nameof` + registration lowering + `addOptions`? List all three `/ttsc` subpaths. `ttsc`
does the work of running them together (see below); you just declare which stages you want.

### Auto-discovery — a convenience, not a requirement

`ttsc` also looks at your project's own `package.json` `dependencies`/`devDependencies`: if one of
them ships a `"ttsc": { "plugin": { "transform": "..." } }` marker, that transform activates
without you listing it in `tsconfig.ttsc.json` at all. Every `@rhombus-std/*.transformer` package
carries this marker, so in the common case installing the package is enough.

Three things worth knowing about it:

- **Direct dependencies only.** It reads your project's own manifest, not the transitive graph —
  a transformer your dependency depends on doesn't auto-activate for you.
- **An explicit `plugins` entry always wins.** Listing a transform yourself (by its raw specifier
  or its resolved path) suppresses auto-discovery for that same transform — no double-registration.
- **A foreign package's own marker can't share a pass with ours.** Auto-discovery doesn't know or
  care which native binary a marker points at. If another dependency (say, a validator library
  with its own compiled transform) auto-activates alongside an `@rhombus-std` transformer, and the
  two resolve to two _different_ owner binaries, `ttsc` throws rather than silently picking one —
  loudly, at build time, naming both plugins. Compose them into one host, or wire only one
  explicitly.

## One binary underneath

Every `@rhombus-std/*.transformer` package's `/ttsc` subpath — `di`, `di-options`, `config`,
`nameof`, `inline`, all of them — resolves to the **same Go source**. That's deliberate: `ttsc` builds one
native binary per distinct source it sees, so no matter how many stages your `tsconfig.ttsc.json`
lists, they all point at one already-compiled binary. Concretely, that means:

- **One build.** The first project to touch it pays a cold `go build`; every plugin entry after
  that (yours, this repo's, any other consumer's, on the same cache) reuses the cached binary.
- **One spawn per compile.** `ttsc` refuses to run two _different_ native backends over one
  source-to-source pass — that's exactly the "foreign marker" throw above. Because every
  `@rhombus-std` stage names the same backend, that check trivially passes no matter how many
  stages you list.
- **Runtime stage selection.** The binary receives the ordered list of active stages on its command
  line (`--plugins-json`) and activates only the ones you declared — listing `di` and `config` but
  not `di-options` runs exactly those two, nothing more.
- **A hardcoded, canonical execution order** — `inline` → `nameof` → `di` → `di-options` → `config`
  — applied regardless of the order you wrote your `plugins` array in. Declaration order is for
  readability only; it never changes what runs first.
- **Loud failure, not silent skip.** An unrecognized stage name, a missing Go toolchain, or two
  plugin entries that can't share a pass all fail the build with a specific message — never a
  quietly-incomplete transform.

This is why a consumer never needs one package per _combination_ of stages — no `di+options`
bundle, no `di+config` bundle. You compose stages by listing them, not by finding the pre-built
combination that happens to match your needs.

## The generic inline stage (`rhombusstd_inline`)

The four stages above each carry hand-written, per-library knowledge of one sugar shape. The
**inline stage** is different: it is a generic single-expression function-inliner that learns what
to substitute from a hand-authored publish list, not from compiled-in rules. Over time it replaces
per-library semantic knowledge — a library authors its sugar as ordinary typed TypeScript whose
single-return-expression body is written over the compile-time primitives, and the inline stage
substitutes that body at consumer call sites (the primitive stages then lower the result).

It is **workspace-only**: every entry it inlines resolves to a sibling package's real `src` file at
build time, in this repo, in this build. There is no published/carrier form of an inlined function,
no shipped src, no dist-JS resolution path — the external-consumption story is a deliberately
parked follow-up.

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
    "import": "./inline-entries/more.json", // optional; string | string[], file-relative, composable
  },
}
```

The three fields map to TypeScript namespaces:

- `type` — a **type-namespace** export, written as a nameof token (`<package>:<TypeName>`,
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

One binary, every stage linked in, activated by a runtime flag — is the shape that avoids all four.

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

## Internals (for maintainers of this repo's transformer sources)

The shared binary lives at `transforms/cmd/ttsc-std` and statically links every stage this repo
ships: the generic single-expression inliner, token/`nameof` derivation, DI registration lowering,
`addOptions<T>()`, and `withType<T>()`. Each `@rhombus-std/*.transformer` package's descriptor
names its own stage (`inline`, `nameof`, `di`, `di-options`, `config`) so `ttsc`'s `--plugins-json`
payload lists them individually — but every descriptor's `source` field resolves to the same
`ttsc-std` directory, so `ttsc` compiles it exactly once regardless of how many descriptors
reference it. The inline stage's descriptor is `@rhombus-std/primitives.transformer/inline-ttsc`.

`ttsc-std` parses `--plugins-json` at startup, builds the set of declared stage names, and runs
only those stages' AST transforms over the loaded program — in the hardcoded canonical order, not
declaration order. An unrecognized stage name in that payload is a build-time error naming the
unknown stage, not a silent no-op.
