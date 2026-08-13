# config-validation lane ledger

PR: https://github.com/fnioc/std/pull/339 (draft, against IServiceManifest-repair)

## Dependencies added

Go (`transforms/go.mod`):

- `github.com/santhosh-tekuri/jsonschema/v6` v6.0.3 — schema compiler/validator. Chosen over
  `google/jsonschema-go` (pre-v1, documented behavior-change escape hatch — too much churn risk
  while the schema itself is still young) and `xeipuuv/gojsonschema` (no draft-2019-09/2020-12,
  slower/less correct per the independent benchmark cited in the research file). Draft-07 auto-
  detected from the schema's own `$schema`. Transitive: `github.com/dlclark/regexp2` (ECMAScript
  regex — JSON Schema's `pattern` keyword needs it, RE2 can't), `golang.org/x/text` (idna/unicode
  for `format` keywords the schema doesn't currently use). This is `transforms/go.mod`'s first
  third-party dependency outside the typescript-go/ttsc/typia shim stack.
- `gopkg.in/yaml.v3` v3.0.1 — YAML decode. No transitive deps.
- `github.com/pelletier/go-toml/v2` v2.4.3 — TOML decode. No transitive deps.

JS (root `package.json` devDependencies):

- `ajv` ^8.20.0 — already a devDependency of `tests/inline.authoring-lint.test`; promoted to the
  root so `scripts/eslint/inline-entries.mjs` (not itself a workspace package) can resolve it.
- `js-yaml` ^4.1.0 — YAML decode, JS twin of yaml.v3.
- `smol-toml` ^1.3.1 — TOML decode, JS twin of go-toml/v2. Picked over `@iarna/toml` (maintenance
  gaps) for an actively-maintained, zero-dependency, spec-compliant (TOML 1.0.0) parser.

No published package gains a runtime dependency — every addition above is a `transforms/` Go
module dependency (build-time only, never shipped in an npm manifest) or a root devDependency
consumed only by lint-time scripts.

## TOML datetime decision

TOML's four temporal types (offset datetime, local datetime, local date, local time) have no JSON
counterpart. Decided: normalize every one to its string form — `time.Time` (offset datetimes) via
`Format(time.RFC3339)`, the three local/partial types via their own `String()` method (ISO 8601
date/time-only text) — rather than rejecting a config that happens to contain one. Same choice
mirrored exactly in the JS loader (smol-toml's local-date/time/datetime objects also stringify via
their own `.toString()`/template literal path to the equivalent ISO 8601 text). TOML integers also
widen to `float64`/JS `number`, matching JSON's single numeric type — this makes a TOML-sourced
value validate and merge identically to a JSON- or YAML-sourced one from that point on.

## Schema vocabulary: one gap closed

Wiring schema validation directly into the resolve path (validate every node at read time, plus a
belt check on the final merge) exposed a real, pre-existing gap: `schema/rhombus-std.schema.json`'s
`entry` union (from #335) had no row for the "own-body instance member" shape (`type`+`member`, no
`impl`) that `entries.go`'s `Kind()` already recognizes as a legitimate — just not yet certified —
grammar row. Without a matching schema branch, that shape was schema-invalid even though it's a
real, documented part of the authoring grammar, which would have downgraded its distinct
`INLINE_KIND_UNCERTIFIED` error to an undifferentiated schema failure. Added `ownBodyMemberEntry`
(`type`+`member`, `additionalProperties: false`) as a fourth `oneOf` branch, mirrored into both
schema copies (see below) — the schema now recognizes every shape `Kind()` recognizes, whether
certified or not; certification status stays exclusively `Kind()`'s call. No other vocabulary
change; the `extends` property description now says "file" instead of "JSON file" since it can
name a YAML/TOML sibling too.

## Two schema copies, one guarded

`go:embed` can't reach outside `transforms/`'s own directory tree (the canonical
`schema/rhombus-std.schema.json` lives one level up, at the repo root), and this repo's ttsc host is
always compiled fresh from the checked-out source tree (never shipped as a portable prebuilt
binary — `ttsc.mjs` resolves `transforms/cmd/ttsc-std` by a relative path from wherever the
`*.extras` descriptor package lives), so a symlink-across-module-boundary trick wasn't worth the
unverified risk. Went with a maintained copy at
`transforms/internal/inlinetransform/rhombus-std.schema.json`, embedded via `go:embed`, guarded by
`TestEmbeddedSchemaMatchesCanonical` (byte-diff against the canonical file) so drift fails the Go
gate loudly instead of silently.

## Error taxonomy: one new code, two old call sites now preempted

New: `INLINE_CONFIG_SCHEMA` — a resolved node failed schema validation, tagged with the file/label
and the schema library's own JSON-pointer path.

Schema validation runs at the top of every `resolveNode` call (covers the package.json marker, every
`extends` target, recursively) plus once more on `ResolveConfig`'s final merged return (the "belt"
check — provably redundant against the *current* schema, since every merge is either object
key-by-key or array concatenation of independently-valid values, but kept as the requested
forward-compatible safety net for schema features that don't exist yet, e.g. cross-key
`dependentRequired`).

Since the (now four-branch) entry union in the schema is an exact mirror of `Kind()`'s own four
grammar rows, a genuinely malformed inline entry (fits none of the four rows) is now always caught
by the schema gate *before* `entriesFromResolved`'s hand-written `Kind()` check ever runs — the two
existing tests exercising that path (`TestLoadInlineEntriesBadShape`, a type+impl-no-member entry;
`TestLoadInlineEntriesNonStringExtends`, a numeric `extends` value) now expect `INLINE_CONFIG_SCHEMA`
instead of `INLINE_ENTRY_SHAPE`/`INLINE_ENTRY_IMPORT`. `Kind()` itself is untouched and still load-
bearing beyond validation (consumed by `bodyextract.go`/`resolve.go`/`stage.go` for member-vs-floater
dispatch); its own `INLINE_ENTRY_SHAPE`/`INLINE_KIND_UNCERTIFIED`/`INLINE_ENTRY_IMPL_FOREIGN` checks
remain live for everything the schema can't express: `ParseTypeRef` string-format validation,
certification status, and the foreign-package `impl` cross-reference rule.

## Left alone

- `entries.go`'s `Kind()`/`EntryKind`/`KindStatus` machinery — unchanged, still the semantic
  classifier the rest of the inline pipeline depends on.
- The `INLINE_ENTRY_IMPORT` code — unchanged meaning (a present file that fails to *parse*, or an
  `extends` chain-cycle-adjacent shape issue the schema doesn't reach because the value never
  successfully parsed into something to validate).
- `schema-drift.test.ts` (validates the four live `*.extras` markers against the schema) — untouched;
  the new `ownBodyMemberEntry` branch only widens acceptance, so those four files stay valid.
