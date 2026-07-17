# Justified divergences from ME

Accepted, owner-signed-off departures from the ME reference that are cross-cutting — not specific
to one package family. Each is deliberate and justified. Family-specific divergences live in that
family's own "Justified divergences" chapter under `docs/libraries/*.md`; foundational,
repo-wide patterns are specified in full in `docs/features/*.md`. This file records only the
sanctioned cross-cutting divergences, and grows as more are reviewed and signed off.

## Foundational pattern — recorded here, specified elsewhere

**The augmentations pattern** (our stand-in for C#'s extension methods) is documented in full at
`docs/features/augmentations.md`; `docs/decisions.v2.md` §89 rules that doc the sole place it's
described. Recorded here only so the departure from ME's extension-method mechanism is on the
books.

## Divergences

### Environment-agnosticism, declared via `types[]`

ME has no notion of a target runtime environment; we add one. **Non-provider libraries are environment-agnostic; provider libraries declare their target environment via the tsconfig `types[]` array** — empty `types[]` ⟺ agnostic, non-empty ⟺ a declared provider for that environment (`["node"]`, `["dom"]`, …). A design rule with no ME analog, and repo-wide rather than one family's concern.
