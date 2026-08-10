# Decisions — owner (GOSPEL)

The authoritative decision record: decisions the owner made, nothing else. Architectural choices are
grounded here and nowhere else. Every entry requires the owner's explicit signoff, and nothing is
ever written here without the owner's knowledge. No entry overrides another — corrections edit the
original in place — and every entry speaks only of the present.

## U1 — `replace` replaces — in place, and nothing when nothing matches

`Manifest.replace(descriptor)` swaps the first `ServiceDescriptor.matches` hit for the incoming
descriptor at the SAME position in the chain, and when no descriptor matches it registers nothing.
It never degrades to `add`.

The reference's `Replace` is remove-then-add-unconditionally: the oldest match is removed, the
replacement is always appended in newest position, and a no-match silently becomes a registration.
That conflation is wrong. Replace means replace — the platform's own `replace` agrees
(`'asdf'.replace('q', 't')` returns `'asdf'`; nothing is appended). A caller who wants
register-regardless composes it from the verbs that say so; a targeted override that quietly turns
into an unconditional registration is a footgun, not a convenience.

In-place also preserves enumeration order: the replaced binding keeps its position rather than
jumping to newest. Under newest-first iteration the singular winner comes out the same either way;
`resolveAll` order does not.

_Owner-ruled and signed off 2026-08-10._
