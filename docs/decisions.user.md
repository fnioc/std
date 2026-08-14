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

## U2 — Go is 100% agnostic of inlinables; everything is driven from the JSON

The engine carries no knowledge of any particular inlinable — no name tables, no per-sugar lists,
no special-cased identifiers in Go source or Go-built registries. Every fact the engine needs about
a sugar (where it is declared, what it is a member of, what runtime target its consumer must
import) lives in the `"rhombus-std".inline` marker JSON — an entry's `from` carries the
package-qualified anchor, and for a free-function entry that is also what the consumer's runtime
import is built from. Go implements only the generic mechanism the JSON drives.

_Owner-ruled and signed off 2026-08-12._

## U3 — An augmentation impl is the exact prototype code; install is verbatim and function identity holds

An augmentation set member is a `this`-based method — the very function that lands on the
receiver's prototype. Install is plain assignment, `proto[name] = fn`, with no wrapper and no
adaptation, so the installed member IS the authored member and identity comparison is
meaningful: re-registration of the same function is recognizable as a no-op, and the collision
throw is reserved for genuine conflicts. The set types supply contextual `this` typing; a member
whose own generic type parameters block contextual `this` carries an explicit `this:` parameter.
Functions that are deliberately not prototype members take their subject as a parameter.

_Owner-ruled and signed off 2026-08-12._

## U4 — One flat `Type`; identifiers are the address-only kinds; resolution is lookup, then construct on a miss

`Type` is one flat node space. `TypeIdentifier = GenericType | NominalType | TagType` names
the address-only kinds: a pure reference has nothing to build from. Every `Type` can be an
address — interning makes any node registrable and resolvable by `===`, and a
`ServiceDescriptor` may link absolutely any `Type` to an implementation. Every non-identifier
`Type` can also serve as a spec: when no registration answers, the container constructs it by
composing looked-up leaves; a pure reference misses instead. The capability lives in the usage
and the registry — a node has one identity, never two.

`TagType = { type: Type, tag: string }`: the inner is unconstrained, so a keyed registration of
any `Type` — a keyed function-typed service included — is spellable; a tag itself is
address-only regardless of inner, because keying is registration intent. `TypeLiteralType` is a
self-supplying leaf. Capability questions are answered by memoized analyzers whose caches live
inside them — the only writer of a cached fact is the walk that derived it from the node itself
— and nodes stay pure data. The partition is vocabulary, never a dispatch axis. The match walk
collects its own placeholders; the bindings it captures are the placeholder inventory the next
step consumes.

_Owner-ruled and signed off 2026-08-12._
