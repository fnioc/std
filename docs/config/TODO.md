> **Historical.** Imported verbatim from `fnioc/config` during the `@rhombus-std` consolidation. Package names (`@fnconfig/*`) and issue/PR numbers below refer to the original `fnioc/config` repo; transferred-issue links redirect to their new home in this repo (e.g. old config #1 → #6).

---

# TODO

Running list of unfinished work and reviewed-but-not-yet-acted-on decisions
for `@fnconfig/config`, as of 2026-07-01. Ground truth is always the GitHub
issues/PRs linked below — this is a snapshot, not the source of truth.

## Blocking — needs maintainer action

- **npm publishing is not yet live.** The immediate `publish-next` install
  bug (`npm ci` in a bun repo with no `package-lock.json`) is fixed in PR
  #10 — but do NOT merge it until npm auth is configured: merging runs
  `semantic-release` on main, which (root is `private`) succeeds and
  creates a git tag + GitHub pre-release before the `npm publish` loop
  fails on missing auth. Remaining maintainer setup: choose npm auth
  (OIDC trusted-publisher is already wired via `id-token: write`, or a
  valid `NPM_TOKEN`); first _manual_ publish of all 5 packages (all 404
  today) before OIDC trust can be registered; register OIDC trust per
  package; create the `production` environment (doesn't exist — blocks
  `promote`); drop `registry-url` from `setup-node` so it can't shadow
  OIDC.
- **Auto-merge needs repo settings, not a code fix.**
  `.github/workflows/auto-merge.yml` already wires
  `GH_TOKEN: ${{ secrets.AUTOMERGE_PAT }}` correctly — it has never worked
  because (confirmed via `gh api`): the `AUTOMERGE_PAT` secret is unset,
  repo 'Allow auto-merge' is off, and `main` has no branch protection
  requiring the `verify` check (GitHub refuses `--auto` on an
  already-mergeable PR — this one is mandatory). Until then, every PR is
  merged by hand (`gh pr merge --squash --delete-branch` after
  `verify: SUCCESS`).
- **Once `NPM_TOKEN` is fixed:** promoting `@next` → `@latest` is a
  manual gate (the `production` environment, reviewer-approval-gated)
  and must be run by the maintainer. Nothing has been promoted; this
  stays untouched by design.

## Feature work — parked

**Issue [#7](https://github.com/fnioc/config/issues/7) —
`addConfig<T>()` binding sugar.** Superseded by the standalone
direction on the `@fnconfig` scope. The original design coupled the
sugar to an external dependency-injection framework and a compile-time
transformer — both of which this library no longer depends on — so the
questions that blocked it (which DI surface to target, transformer
compatibility, mono- vs. multi-repo packaging, and an `addConfig`
naming collision with the transformer's method-detection) are all moot.
Parked pending a fresh design that fits the no-framework,
no-transformer model.

## Deferred, no blocker, not started

- **Issue [#1](https://github.com/fnioc/config/issues/1)** —
  live-reload / config monitoring (file-watch, re-bind on change). No
  design yet.
- **Post-configure hook.** Mentioned in the PR #4 shipping log as
  backlog; no design yet.

## Reviewed architecture decisions — Options

- **Not porting `MEO`.** Validated against the actual upstream reference
  repo source: Options is a DI-lifetime + reflection-amortization +
  change-notification wrapper around Configuration binding, and this port
  has neither reflection (types are erased in TS; `bindConfig` binds
  explicitly and cheaply) nor a DI container to integrate lifetimes with.
  Its one broadly useful piece —
  live reload — is `IConfiguration`'s feature, not Options', and maps to
  issue [#1](https://github.com/fnioc/config/issues/1) above. Named
  options and validation already fall out of `bindConfig` as shipped;
  `PostConfigure` maps to the post-configure hook item above. Full
  capability-by-capability mapping and source citations:
  [`docs/no-options-port.md`](./no-options-port.md).

## Reviewed architecture decisions (confirmed by maintainer 2026-07-01, no changes needed)

Baked into the shipped MVP (PRs #4/#5/#6). Revisit only if a real need
surfaces:

- **Last-source-wins flat merge** (not deep merge) across JSON/env/CLI
  sources.
- **Case-insensitive resolution everywhere** — keys, sections,
  `opts.section` — meaning two differently-cased keys can never coexist
  as distinct entries.
- **`ConfigBindError` aggregates every problem** into one throw instead
  of failing on the first bad field.
- **`SchemaFor<T>` compile-time checking is the only safety mechanism in
  the MVP** — no independent runtime schema-validation layer; bad values
  are only caught by `bindConfig`'s coercion.
- **Fix-forward instead of revert** for the PR #4 premature-merge
  incident — the merge stayed, review findings shipped as follow-up PRs
  #5/#6 rather than reverting and redoing.
- **Draft PR #2 closed as superseded** rather than reconciled, since
  the standalone example shipped for real in PR #4 and collided with
  the sketch.
