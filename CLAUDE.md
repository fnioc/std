# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# `@rhombus-std` monorepo

Project-specific rules only. General git/commit/worktree conventions live in user prefs, not here.

**Decision records** (`docs/`) — one authority rule: only the owner's file is gospel.

- **`decisions.user.md` — GOSPEL.** Owner's decisions only. Never write without the owner's knowledge.
- **`decisions.v2.md` — NOT gospel.** Claude's own decision log. Write freely.
- **`decisions.md` — retired; never write to it.**
- **No entry ever overrides another — correct the original in place instead.** Entries speak only of
  the present, never of how things used to be.
- **di2 decisions stay distinct from di** until the owner says otherwise.

The root `README.md` is scaffolding-era and stale — ignore it.

## Issue coding gate

Before writing any code for a GitHub issue, it must carry **both** `signoff` **and** `claude-ready`.
Both labels already exist — **never create new ones.**

- **`signoff`** — the owner's explicit go-ahead. Apply it yourself when the owner tells you to
  proceed ("do it", "go ahead", "code this", "ship it", or any equivalent).
- **`claude-ready`** — your own honest judgement that the issue can be implemented to completion
  with **zero** further owner interaction. Add it when that's true; remove it when it isn't.

Maintain `claude-ready` **silently**: whenever you look at an issue, add or remove it to match
"could I finish this unattended right now?" — don't narrate the change or ask about it, just adjust.

## Commands

Runtime is **bun** (workspaces, isolated linker per `bunfig.toml`). `mise.toml` pins Node to 24 and
pnpm/knip to exact versions; **bun and Go both track `latest` and are not pinned**.

| Task                    | Command                                                                        |
| ----------------------- | ------------------------------------------------------------------------------ |
| Install                 | `bun install`                                                                  |
| Build all (topological) | `bun run build`                                                                |
| Test all (the gate)     | `bun run test`                                                                 |
| Test one package        | `bun --filter '@rhombus-std/di.test' test` (or `cd tests/di.test && bun test`) |
| Test one file / name    | from a test-package dir: `bun test <path>` · `bun test -t '<pattern>'`         |
| Lint all                | `bun run lint`                                                                 |
| Format                  | `bun run format` (write) · `bun run format:check`                              |

- **`bun run build` (topological), never `bun --filter '*' build`.**
- **`bun run test` is the full gate** — unit tests + e2e (ttsc parity, app output-diff). CI splits
  across jobs but `bun run test` locally is authoritative. `verify` is the required merge-queue check.
- **Typecheck is per-package** via `tsc --noEmit -p tsconfig.ci.json`. Each package's `tsconfig.json`
  is the **editor** config (whole-repo program for cross-package IDE features); the build and gate
  never read it. The root `typecheck` script checks nothing — don't rely on it.
- **Lint** is `tsc --noEmit` for 29 of 32 libraries. Only `di`, `di.core`, and `hosting.core` run
  `eslint .`. Formatting is **dprint** (`useBraces: always`).
- **Go gates**: `node scripts/gen-go-work.mjs` then from `transforms/`,
  `go build ./... && go vet ./... && go test ./... && gofmt -l .` (needs mise Go).

## Architecture

This section reflects the code as it exists — orientation for new agents, not requirements.
Read the source for authoritative details on any package.

The package graph mirrors the `ME.*` reference dependency graph
(`docs/reference/me-extensions-dependencies.md`). **The mirror is a means, not the goal** — where
an `ME.*` shape conflicts with what's most correct for TS, prefer correctness.

### Package families

- **`primitives`**, **`primitives.extras`** — hand-made original; the universal zero-dep leaf. Type
  node space, change tokens, augmentation infrastructure, platform typings.
- **`di`**, **`di.core`**, **`di.extras`** — hand-made original; the DI container. di.core is the
  abstractions (`Manifest`, `Registration`, error taxonomy), di is the resolution engine.
- **`options`** — port, reworked for platform differences. `options.augmentations` is the one place
  di and config meet.
- **`config`** — port, reworked for platform differences. di-independent.
- **`hosting`** — port, under active rework by the owner. Volatile — read the source.
- **`diagnostics`** — best-effort port; read the source for current state.
- **`logging`** — best-effort port; read the source for current state.
- **`caching`** — best-effort port; read the source for current state.
- **`fileproviders`** — best-effort port; read the source for current state.

### Cross-cutting invariants

Confirm against `docs/decisions.v2.md` before touching these:

- **di ⊥ config** — neither imports the other; the only bridge is `options.augmentations`.
- **Library refs abstractions; entry point refs engine** — everything a library needs is reachable
  from `di.core` alone.
- **Interface-first; no concrete leaks** — public signatures use `IServiceProvider`, `Manifest`;
  never `DefaultManifest`, `ServiceProvider`.
- **The manifest is IMMUTABLE** — every verb returns a NEW manifest; a discarded result registers
  nothing.
- **Runtime identity is load-bearing** — primitives and di.core guard against duplicate copies at
  load time. Every bundling package keeps `@rhombus-std/primitives` and `@rhombus-std/di.core`
  external — inlining forks identity. Same for the rolled `.d.ts`.
- **Augmentations** — file naming: `<Receiver>-<Topic>-augmentations.ts` (receiver's leading `I`
  dropped). OPEN receivers use `registerAugmentations` + `@augment`; CLOSED use
  `applyAugmentations`. Full mechanics: `docs/features/augmentations.md`.

**Keep this digest in step with `docs/decisions.v2.md`.**

## Package naming

`@rhombus-std/<family>[.<qualifier>]`.

- **Families**: `primitives`, `di`, `options`, `config`, `hosting`, `diagnostics`, `logging`,
  `caching`, `fileproviders`.
- **Qualifiers:** `.core` (abstractions), `.augmentations` (declaration-merging extension),
  `.extras` (sugar-only authoring package + ttsc descriptor). Config providers keep their own name
  (`config.json`, `config.env`, `config.commandline`, `config.file`, `config.ini`, `config.xml`);
  other families follow suit (`logging.console`, `logging.browserconsole`, `hosting.browser`).

## No-transformer-first

Every capability must be usable **smoothly and intuitively with no transformer at all** —
by direct consumers of these libraries _and_ by consumers of downstream libraries authored
on top of them. Design that hand-written experience first and make it good on its own
terms; it is the real API surface.

Transformers are pure ergonomics layered on afterward. A transformer must lower to
**exactly what a no-transformer user would have written by hand** — it may delete
boilerplate, never add a capability or change behavior. So the explicit forms
(`add(token, …)`, `addOptions(token, …)`) are primary and complete; the type-driven forms
(`add<T>()`, `addOptions<T>()`) are sugar rewritten _into_ them.

## typefor calls are always inline

`typefor<T>()` is spelled directly at its use site, every time — never hoisted into a const
(module-level or otherwise) and never wrapped in a helper. No address consts.

## Comments

**A comment explains the code in front of the reader — never the history of how it got there.**
Where a case isn't covered below, decide by asking _does this help someone understand the code in
front of them?_

**Never write:**

- **Any allusion to `ME.*` / the reference implementation, however oblique** — "ported from `ME.X`",
  "the reference's Y", "reference parity", "mirrors the reference", ".NET", "Microsoft". An
  **intra-repo cross-reference is not lineage** ("the tracing counterpart of `MeterScope`" is fine).
- `§N` decision refs, issue/PR numbers, version lore.
- Superseded designs and decided-against alternatives.
- Transformer / plugin / "no-transformer" / "lowers to" framing.
- Restatements of visible code or what a NAME already conveys.
- Stale build-layout narration — **verify against the package's `exports` before citing resolution
  behavior**.

**Write** only what helps a caller use a public member, or is genuinely hard to grok on a quick
read. When torn, delete. Form is real TSDoc — `@remarks` for prose, `@param`/`@returns` OMITTED when
the signature already says it. `libraries/primitives/src/augmentation/registry.ts` is the canonical
swept file — match it.

## Build layout

**In-repo resolution is source-first; dist is the published surface only.** Every library's dev
`exports` resolve `./src/index.ts`; `publishConfig` carries the dist surface for published
consumers. Nothing in-repo depends on dist being built.

**`./private/*`** is the dev-only deep-import seam for white-box tests, scrubbed from
`publishConfig.exports`.

**Build args are derived, not authored.** No per-package `build.ts` — `scripts/build-lib.ts` derives
args from the manifest (`external` = deps ∪ peers, lowering stage iff `tsconfig.ttsc.json` exists).
`publishConfig` is derived too (`scripts/derive-publish-config.ts`, drift-checked by lint).

**Published dist is bundled** (`bun build` for JS, `rollup-plugin-dts` for `.d.ts`), never raw
`tsc` output.

### Transformer engine

A single Go/`ttsc` binary under `transforms/`. One always-on stage table
(mergesynth → inline → typefor → schemaof) looped to a fixed point per file. Go comes from
**mise only**. Full mechanics: `docs/features/transformer-architecture.md`.

The primitive roster is two verbs: `typefor<T>()` (names/observes a type) and `schemaof<T>()`
(expands one into its member tree). Both live in `primitives.extras`.

Every `*.extras` package carries a barrel re-exporting its marker bodies by name (the inline
stage resolves `impl` by walking the re-export graph). `di.extras` depends on **`di.core` types
only, never the `di` runtime** — hard invariant.

## Publishing

**Publish with pnpm — never npm (or `bun publish`).** pnpm is the only package manager that rewrites
`exports` from `publishConfig` at publish time.

## Repository settings

Repo settings, labels and rulesets are code: **`.github/settings.yml`**. **Change them by editing
the file and PRing it**, never through `gh api` or the web UI.

- Every **list section is destructive** — an entry absent from the file is DELETED remotely.
  Dropping a label strips it from every issue/PR carrying it. Omitting a whole section is safe;
  half-populating one is not.
- Secrets/variables: `gh secret set` / `gh variable set` (never the file).
- A sync takes ~13 minutes and reports nothing.
- Two `repository:` keys (`topics`, `security_and_analysis`) are set by hand — see the commented
  entries in the file for reproduction.

## Tests

Tests live in sibling `tests/<lib>.test` packages (files under `tests/<lib>.test/test/`), not
co-located with `src/`. Transformer parity suites are `tests/<family>.ttsc.e2e` (`test:e2e`).

- **White-box**: via the library's `./private/*` seam — a deep import of the source file.
- **Black-box**: via a plain `workspace:*` devDependency on the library.
