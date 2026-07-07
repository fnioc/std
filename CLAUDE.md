# `@rhombus-std` monorepo

Project-specific rules only. General git/commit/worktree conventions live in user prefs, not here.

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

## Publishing

**Publish with pnpm — never npm (or `bun publish`).** The dev→dist swap and the
`internal/*` white-box scrub (`docs/decisions.md` §7) both ride on `publishConfig.exports`;
pnpm is the only package manager that rewrites `exports` from that override at publish
time. Publishing with anything else ships the wrong entry points and leaks `internal/*`.

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

## Source-libs layout

Packages consume each other's raw TS `src` directly: `workspace:*` + `exports` with
`source`/`bun`/`types` conditions pointing at `.ts`, `moduleResolution: bundler`. The
`import`/`default` conditions point at built `dist` — that's what published consumers
resolve.

## Tests

Tests live in sibling `tests/<lib>.test` packages, not co-located with `src/`.

- **White-box** (needs to reach into a library's internals): via that library's
  `internal/*` export subpath.
- **Black-box** (exercises only the public surface): via a plain `workspace:*`
  devDependency on the library.

See `docs/decisions.md` §7 for the rationale and the publish-time scrub mechanics.
