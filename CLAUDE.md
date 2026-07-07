# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# `@rhombus-std` monorepo

Project-specific rules only. General git/commit/worktree conventions live in user prefs, not here.

**`docs/decisions.md` is the living design record** — every load-bearing package boundary and
invariant below is numbered and justified there (cited as "§N"). Read it for the _why_ before
changing a boundary, and append to it when a decision lands. The root `README.md` is
scaffolding-era and stale — ignore it.

## Commands

Runtime is **bun** (workspaces, isolated linker per `bunfig.toml`); `mise.toml` pins bun + Node 24.

| Task                    | Command                                                                        |
| ----------------------- | ------------------------------------------------------------------------------ |
| Install                 | `bun install`                                                                  |
| Build all (topological) | `bun run build`                                                                |
| Test all (the gate)     | `bun run test`                                                                 |
| Test one package        | `bun --filter '@rhombus-std/di.test' test` (or `cd tests/di.test && bun test`) |
| Test one file / name    | from a test-package dir: `bun test <path>` · `bun test -t '<pattern>'`         |
| Lint all                | `bun run lint`                                                                 |
| Format                  | `bun run format` (write) · `bun run format:check`                              |

- **`bun run build` (topological), never `bun --filter '*' build`.** It runs
  `scripts/build-all.ts`. Transformer-active packages resolve their upstream through the `built`
  d.ts condition, not source (see [Build layout](#build-layout--source-libs-with-a-built-exception)),
  so the upstream `dist` must be complete and stable before they compile — a flat parallel build
  races and silently mis-resolves. `build-all` tiers the workspace by its dependency graph and
  finishes each tier before the next (§1/§9).
- **`bun run test` is the full gate — there is no CI.** It includes the `examples.app.*`
  output-diff e2e: build with `tspc`, run, `diff` stdout against the checked-in `expected.txt` (§16).
- **Typecheck is per-package**, inside each package's `build`/`lint` (`tsc --noEmit -p tsconfig.json`,
  or `tspc --noEmit` for transformer-consumers). The root `typecheck` script (`tsc -b`) points at
  an empty solution stub and checks nothing — don't rely on it.
- **Lint** is eslint (typescript-eslint, type-aware) over `libraries|examples/*/src`; but
  transformer-consuming packages lint by _typechecking_ (`tsc`/`tspc --noEmit`), since their
  authored forms only exist after the transform. Formatting is **dprint** (`useBraces: always`).

## Architecture

Four package families **mirror the `ME.*` reference dependency graph**
(`docs/reference/me-extensions-dependencies.md`) package-for-package and edge-for-edge; the
API surface _within_ a package may deviate where TS/bun justifies it, but the graph is faithful
first and a distinction is collapsed only after it's shown unjustified (§0). Naming below in
[Package naming](#package-naming).

- **`primitives`** — universal leaf, zero deps. The change-token trio (`IChangeToken`,
  `ChangeToken.onChange`) that underpins live-reload (§8).
- **`di`** — `di.core` (the abstractions **and** the concrete `ServiceManifest` registration
  builder + registration-time errors — it ships runtime, §9) ← `di` (the resolution engine:
  scopes, resolution, captive-dependency protection, disposal). `di.transformer` (ts-patch: token
  derivation, dependency extraction, registration lowering, factory-signature diagnostic) depends
  on **`di.core` types only, never the `di` runtime** (§2 — hard invariant). `di.transformer.options`
  is a satellite lowering the `addOptions<T>()` sugar (§15).
- **`options`** — the collapsed `Options<T>` accessor + the configure / post-configure / validate
  `OptionsFactory` pipeline (§4). Depends **`di.core` only; config-unaware.** `options.augmentations`
  is the **one place di and config meet** — the config→`Options<T>` bridge (§14).
- **`config`** — `config.core` (types-only `IConfiguration*`) ← `config` (builder/root/section
  engine + reload tokens, §8) ← providers `config.json` / `config.env` / `config.commandline`
  (each a `declare module` augmentation adding e.g. `addJsonFile` to `ConfigurationBuilder`).
  `config.transformer` rewrites `.withType<T>()` and is standalone — di-independent (§15).
- **`hosting`** (`hosting.core`, `hosting`) — skeletons, pending.

Cross-cutting invariants (each spans several packages — confirm against `docs/decisions.md`
before touching):

- **di ⊥ config** — neither imports the other; the only bridge is `options.augmentations` (§4.3).
- **Interface-first; no concrete leaks** — public signatures use the `di.core` interfaces
  (`ServiceProvider`, `Resolver`, `ServiceManifest`); the concrete `*Class` impls never appear in
  a public type (§1, §10).
- **Runtime identity is load-bearing** — `di` keeps `di.core` _external_ in its bundle so the
  `ServiceManifestClass` it prototype-patches `build()` onto is the same object that cross-package
  augmentations patch; a private inlined copy forks identity and breaks the patch (§9). config keeps
  providers external for the same reason.

## Package naming

`@rhombus-std/<family>[.<qualifier>]`.

- **Families** (mirror the reference `ME.*` graph — see
  `docs/reference/me-extensions-dependencies.md`): `primitives`, `di`, `options`,
  `config`, `hosting`.
- **Qualifiers:**
  - `.core` — the abstractions/contracts layer for a family.
  - `.augmentations` — a side-effect declaration-merging extension package.
  - `.transformer` — an authoring-time transformer for a family.
  - Config providers keep their own name instead of a generic qualifier:
    `config.json`, `config.env`, `config.commandline`.

## No-transformer-first

Every capability must be usable **smoothly and intuitively with no transformer at all** —
by direct consumers of these libraries _and_ by consumers of downstream libraries authored
on top of them. Design that hand-written experience first and make it good on its own
terms; it is the real API surface.

Transformers are pure ergonomics layered on afterward. A transformer must lower to
**exactly what a no-transformer user would have written by hand** — it may delete
boilerplate, never add a capability or change behavior. So the explicit/token forms
(`add(token, …)`, `addOptions(token, …)`) are primary and complete; the type-driven forms
(`add<T>()`, `addOptions<T>()`) are sugar rewritten _into_ them.

## Build layout — source-libs, with a `built` exception

Packages consume each other's raw TS `src` directly: `workspace:*` + `exports` whose
`source`/`bun`/`types` conditions point at `.ts`, under `moduleResolution: bundler`. The
`import`/`default` conditions point at built `dist` — what published consumers resolve.

Two deviations, both because a **transformer** is in play:

- **The `built` condition.** A program that pulls a transformer's `declare module` augmentation
  into scope (via its `tsconfig` `types` array) cannot co-compile di's _source_ — the impl classes
  stop satisfying their interfaces once the authored 0-arg forms are merged in. Such packages set
  `customConditions: ["built"]`, so the di family resolves to its rolled `.d.ts` instead —
  reproducing how a real published consumer sees di. This is why build order matters and why
  `bun run build` is mandatory over a flat parallel build (§1/§9).
- **`tspc`, not `tsc`.** Transformer-active packages build/typecheck with `tspc` (ts-patch), wired
  per-package: a `plugins: [{ transform, import }]` entry in `tsconfig.json` plus the `types` array
  bringing the augmentation into the program. `ts-patch`, `rollup`, and `rollup-plugin-dts` live at
  the repo root so every workspace can reach them.

Published `dist` is **bundled** (`bun build` for JS, `rollup-plugin-dts` for one rolled `.d.ts`),
never raw `tsc` output — extensionless bundler-style imports don't resolve under plain Node ESM
(`scripts/build-package.ts`).

## Publishing

**Publish with pnpm — never npm (or `bun publish`).** The dev→dist swap and the
`internal/*` white-box scrub (`docs/decisions.md` §7) both ride on `publishConfig.exports`;
pnpm is the only package manager that rewrites `exports` from that override at publish
time. Publishing with anything else ships the wrong entry points and leaks `internal/*`.

## Tests

Tests live in sibling `tests/<lib>.test` packages (files under `tests/<lib>.test/test/`), not
co-located with `src/`. End-to-end suites that cross the transformer→engine boundary are
`tests/<family>.tests.integration`.

- **White-box** (needs to reach into a library's internals): via that library's
  `internal/*` export subpath.
- **Black-box** (exercises only the public surface): via a plain `workspace:*`
  devDependency on the library.

See `docs/decisions.md` §7 for the rationale and the publish-time scrub mechanics.
