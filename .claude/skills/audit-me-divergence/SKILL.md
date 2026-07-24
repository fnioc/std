---
name: audit-me-divergence
description: >-
  Audit the whole @rhombus-std monorepo for divergences from the ME reference implementation and
  (re)generate docs/me-divergence.md — a single repo-wide catalogue with stable, citable IDs
  (MED-F.A.T.D). Use when the user asks to "audit divergences from ME", "compare the port against
  the reference", "what did we do differently from ME", "refresh/regenerate the divergence doc", or
  "find where we deviate from the reference". Read-only against sources; only docs/me-divergence.md
  is written. Numbers are permanent — a re-run preserves every existing ID and only appends.
---

# Audit ME divergences

Produce (or refresh) **`docs/me-divergence.md`**: one repo-wide catalogue of every place this port
deliberately or incidentally diverges from the ME reference, each carrying a **stable, permanent
ID** so other docs (issues, `decisions.md`, PRs) can cite an individual divergence and never have
the reference drift.

This is a **mirror-first** repo (`docs/decisions.md` §0): the port replicates the ME package graph
edge-for-edge, then collapses distinctions only once shown unjustified. This audit is the ledger of
_where and why_ the two have parted — the raw material for the later "collapse away from ME" pass.

## The reference source (never name it in a checked-in artifact)

Compare against the **ME reference source checked out locally**. Its on-disk location, layout, and
the sparse-checkout gotchas are recorded in the **`me-reference-source-on-disk` project memory** —
read that memory to resolve the path; do not hard-code it here. Each ME library lives under
`<reference-root>/<ME-package-dir>/src/*.cs` (also `/ref` for the public contract, `/tests` for
behaviour).

**Naming taboo (`microsoft-naming-taboo` memory):** the vendor name and the literal reference path
must **never** appear in `docs/me-divergence.md`, this skill, commits, or any other checked-in or
published artifact. Refer to reference packages by **ME-shorthand** only — replace the vendor
namespace prefix with `ME.` (the on-disk folder `…DependencyInjection.Abstractions` is cited as
`ME.DependencyInjection.Abstractions`; `…Options` as `ME.Options`; etc.). Every string that flows
into the doc — summaries, detail prose, source citations — must already be in shorthand. When you
dispatch auditor subagents, give them the resolved path in their (ephemeral, non-checked-in) prompt
and instruct them to emit **only** shorthand in their returns.

## Output & citation scheme

The doc is a four-level outline. Each **leaf divergence** has the ID **`MED-F.A.T.D`**:

| Level              | Meaning                                                                                                                        | How its number is fixed                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **F** — family     | one of the nine `@rhombus-std` families                                                                                        | **hard-coded** (table below); never changes                                                                                              |
| **A** — area       | a comparison unit in the family: an ME package that maps here, or one of our sub-packages with no ME analog (a `.transformer`) | ordinal after sorting all areas in the family by **identity string** (ME-shorthand namespace, or our package name), ascending code-point |
| **T** — type       | an ME type (interface/class/static holder) in that area; for no-analog areas, our own type                                     | ordinal after sorting the area's types by **type name**, ascending                                                                       |
| **D** — divergence | one specific divergence on that type                                                                                           | ordinal after sorting the type's divergences by **slug**, ascending                                                                      |

Other docs cite a divergence as **`MED-4.2.3.1`** (config family → area 2 → type 3 → divergence 1).

### Fixed family index — F (never reorder, never renumber)

Mirrors the order of the `## Architecture` section in the root `CLAUDE.md`.

| F | Family          | ME packages that map here                                                                                                            |
| - | --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1 | `primitives`    | ME.Primitives (change-token subset only)                                                                                             |
| 2 | `di`            | ME.DependencyInjection.Abstractions, ME.DependencyInjection (+ our `.transformer` areas, no analog)                                  |
| 3 | `options`       | ME.Options, ME.Options.ConfigExtensions, ME.Options.DataAnnotations                                                                  |
| 4 | `config`        | ME.Configuration(.Abstractions/.Binder/.FileExtensions) + providers (.Json/.EnvironmentVariables/.CommandLine) + our `config.extras` |
| 5 | `hosting`       | ME.Hosting, ME.Hosting.Abstractions                                                                                                  |
| 6 | `diagnostics`   | ME.Diagnostics, ME.Diagnostics.Abstractions                                                                                          |
| 7 | `logging`       | ME.Logging, ME.Logging.Abstractions, ME.Logging.Configuration                                                                        |
| 8 | `caching`       | ME.Caching.Abstractions, ME.Caching.Memory                                                                                           |
| 9 | `fileproviders` | ME.FileProviders.Abstractions, ME.FileProviders.Composite                                                                            |

## The stability contract — append-only, never renumber

This is the load-bearing rule. A `MED-…` ID, once assigned, is **permanent**, exactly like a
`decisions.md` §N number.

- **Identity of a divergence** = `(F, area-identity, type-identity, slug)`. The **slug** is a short
  kebab-case key derived from the _semantic content_ of the divergence, not its wording
  (`keyed-services-omitted`, `options-snapshot-collapse`), so it survives prose edits.
- **On a re-run, read the existing `docs/me-divergence.md` first.** Every divergence whose identity
  still matches keeps its exact number. Only genuinely new divergences are allocated numbers — the
  next free integer in their scope (which may leave gaps; gaps are fine and expected).
- **Never reuse or reassign a number.** A divergence that no longer holds (we changed the code to
  match ME, or the ME comparison point is gone) is **tombstoned**: kept in place with its ID, struck
  through, marked `RESOLVED — <date/PR>`. It never disappears and its number is never handed to
  something else.
- **First run (empty doc): deterministic allocation.** With no prior doc, allocate by the sort keys
  above (area→type→divergence). This makes a from-scratch regeneration reproduce the same baseline
  given unchanged sources — but it is the ledger, not the sort, that guarantees stability once IDs
  are in the wild. Do not rely on the LLM surfacing the identical set each run; rely on preservation.

## What is a divergence (and what is not)

Record a divergence when the port departs from the reference in a way a reader porting _from_ ME
would want flagged. Tag each with a **kind**:

- **`omission`** — an ME type/member/package intentionally not ported (YAGNI, no consumer, or a
  .NET-ism with no TS justification). Cite the reason. (See the `yagni-on-me-ports` memory.)
- **`shape`** — ported, but the API shape differs (merged/split types, collapsed interfaces,
  renamed/reordered members beyond mechanical casing, different generic surface).
- **`behavior`** — ported with the same shape but different runtime semantics.
- **`semantic`** — a whole-model departure forced by the target platform (no reflection, no shared
  framework/TFM conditionals, structural typing vs nominal, `declare module` augmentation vs
  partial classes, transformer-as-ergonomics).
- **`addition`** — something in our port with **no** ME analog at all (the `.transformer` families,
  the dual-export extension installer, `internal/*` white-box exports).

**Do NOT itemize — catalogue each such _class_ once in the appendix instead (see below):**

- **Mechanical / cosmetic differences** — uniform across the whole port; listing each would bury the
  signal. If in doubt whether something is mechanical, it is mechanical.
- **Reference-deprecated surface** — a reference type/member the reference _itself_ marks `[Obsolete]`
  (especially `error: true`) that the port omits. The reference is retiring it, so not porting it
  needs no per-item justification. (A reference-`[Obsolete]` member the port nonetheless _ported_, or
  one whose omission actually changes behaviour, is still a normal divergence.)

## Run procedure

1. **Resolve** the reference path from the `me-reference-source-on-disk` memory.
2. **Fan out one auditor per family** (split `config` — it is the heaviest — into a core-engine
   auditor and a providers/transformer auditor; both still emit family `F=4`). Prefer a `Workflow`
   so a deterministic step can assemble the result. Give each auditor: its `F`, the resolved
   reference dirs for its family, our `libraries/<pkg>/src` dirs for its family, this taxonomy, the
   shorthand rule, and the fixed appendix list so it does not re-report mechanical diffs. Auditors
   are **read-only** and return **structured** divergences (area-identity, type-identity, slug, kind,
   one-line summary, a few sentences of detail, `ME:` and `Ours:` citations) — never prose with
   numbers baked in.
3. **Assemble deterministically** (in code, not by hand): group by `F` in the fixed order; within
   each family sort areas / types / divergences by their keys; apply the append-only ledger against
   the existing doc; render `MED-F.A.T.D`.
4. **Write** `docs/me-divergence.md` and commit. The change is docs-only — it touches no
   `libraries|examples/*/src`, so the lint/test gate does not apply to it.

## The appendix (mechanical classes deliberately skipped)

`docs/me-divergence.md` ends with an appendix listing the difference _classes_ the audit skips
wholesale, so a reader knows they were considered and are intentional, not missed. Keep this list
current; it includes at least: file/dir casing (`PascalCase.cs` → kebab/camel `.ts`),
namespace→package rename (per the `me-port-naming-map` memory), C# `namespace`/`using` mechanics,
XML-doc → TSDoc reformatting, access-modifier keywords (`public`/`internal`/`sealed`/`partial`) →
`export`/module boundaries, C# property syntax → TS accessors/fields, `PascalCase` members →
idiomatic `camelCase`, primary constructors / `readonly` fields, nullable annotations (`#nullable`,
`T?`) → TS `?`/`| undefined`, `[Attribute]` decoration → none, generic-constraint syntax
(`where T : …`), and **reference-deprecated surface** — types/members the reference itself marks
`[Obsolete]` (especially `error: true`) that the port omits (the reference is retiring them; not
porting them is auto-skipped, not a divergence). Auditors may return **family-local** skip classes;
collect those into the appendix too, grouped by family.
