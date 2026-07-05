# @rhombus-std

Monorepo consolidating three package families under one workspace:

- **di** — type-driven, interface-first dependency injection for TypeScript
- **config** — layered, provider-based configuration for TypeScript
- **hosting** — (skeletons pending)

## Layout

Flat, not nested by family:

- `libraries/<name-without-scope>` — one directory per published package, e.g.
  `libraries/core`, `libraries/config-json`.
- `examples/<family>.examples.<name>` — runnable examples, namespaced by
  family to avoid collisions across the consolidated repos.

Packages are bun workspaces and consume each other's raw TypeScript source
directly (no build step between them) via `workspace:*` dependencies and
`moduleResolution: "bundler"` in `tsconfig.base.json`.

## Tooling

- **bun workspaces** with the isolated linker (`bunfig.toml`:
  `[install] linker = "isolated"`) — no flattened `node_modules`, no
  `linkWorkspacePackages`.
- **dprint** for formatting, **eslint** (typescript-eslint) for linting,
  **tsc -b** for typechecking against the empty root solution stub.

## Building transformer-consuming packages

Some packages (the di and config transformers, and anything that consumes
them) rely on a custom TypeScript transformer applied at compile time. Those
packages build with `tspc` (from `ts-patch`), not plain `tsc` — wire this up
per-package via a `plugins` entry in that package's `tsconfig.json` plus an
`import` of the transformer package in the consuming entry point. `ts-patch`
and `rollup`/`rollup-plugin-dts` live at the monorepo root so every workspace
can reach them.

## Status

This is root scaffolding only — no package sources have been imported yet.
Releases and CI are intentionally not configured.
