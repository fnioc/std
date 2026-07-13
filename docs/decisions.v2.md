# Decisions (v2)

The live record of **owner-ratified** design decisions. Each entry keeps its original `§N`
id so existing `§N` citations across the codebase still resolve here. Entries arrive only two
ways: migrated from the retiring `decisions.md` on explicit owner approval, or recorded fresh
when the owner signals to save one. Kept terse on purpose — this doc is primarily for Claude's
use. Migration rules live in the block at the top of `decisions.md`.

---

## §79 — Augmentation collision model (delta install + blind prototype merge)

When two augmentation registrations put the same-named member on one class, that's a real
collision. Three parts make it correct-by-construction:

1. **Delta install.** `@augment` installs only each registration's own new members — the first
   application catches up on whatever was already registered, later registrations add only their
   own `set` — so a member reaches a prototype **exactly once**. Delivered via a synchronous
   per-token subscriber list, deliberately NOT an `EventTarget` bus (whose `dispatchEvent`
   swallows a listener's throw, which would silently drop a genuine collision).
2. **Blind merge.** Installing member `n` asks only "is `n` already on the prototype?" Absent →
   mount it. Present → real collision → mount a dispatcher if a `merge` strategy was supplied,
   else **throw** (`augmentation "n" collides on <Class> — supply a merge strategy`). No token /
   receiver / member-identity inspection.
3. **Bag = `Multimap<string, [fn, merge?]>`** per token: each contribution pairs its fn with its
   own strategy; a second same-name registration just appends (the throw lives at install, not
   registration).

Double-installs are harmless by construction (mounted once). No-transformer path: a wrapper
sharing a primitive's name (`log`/`beginScope`, `tryGetValue`, `createLogger`, di's `build`)
supplies a hand-written merge; the convenience form is runtime dot-callable but NOT a typed
overload (TS2430), so the typed path stays the standalone functions. The transformer will later
auto-generate the default merge (deferred). _Owner-approved._

---

## §47 — Prefer relative internal imports; fall back to the fully-qualified specifier when relative doesn't work

Within a package, internal imports are relative by default. Reach for the fully-qualified package specifier (`@rhombus-std/<pkg>`) only where a relative one won't resolve correctly — the standing case being a `declare module` augmentation target, which must name the package **barrel** so the merge lands on the class every consumer resolves and survives the published `.d.ts`. _Owner-approved._

---

## §72 — Every runtime library is dist-referenced

A library's `.` export resolves its type-facing conditions and `bun` to the rolled `./dist`; none resolve to `./src`. A self-augmenting core resolves its **own** compile back to source through a package-unique `<pkg>-source` custom condition listed first on the `.` export (so it can `declare module` its own barrel before its dist exists). The `./_/*` subpath is the only src-resolving export (§83). _Owner-approved._

---

## §74 — `nameof` and token derivation

`nameof<T>()` is declared in `@rhombus-std/primitives` with a throwing body (a call reaching runtime means the transformer wasn't wired). The transformer lowers it to a token identifying where `T` sits in the exports graph — the package barrel for a publicly-exported type (`pkg:Type`), the `_` subpath for a tests-only one (`pkg/_/file:Type`). It keys on export **membership**, not on-disk path, so a package's own build and an external consumer derive the identical token. _Owner-approved._

---

## §83 — The `_` export is for tests and `nameof` only

Each library's `./_/*` subpath maps to `./src/*` and is publish-scrubbed, so it is reachable by exactly two things: that library's own white-box tests (which import through it), and `nameof`'s token form for a type reachable only through it (`pkg/_/file:Type`, §74). Nothing in shipped code imports through `_`. _Owner-approved._

## §24 — No pluggable containers

di has ONE container type. `build()` accepts a `ServiceProviderFactory` — the type lives in
di.core only so the hosting builders share one shape instead of hand-rolling four copies — but it
IGNORES it: there is nothing to swap. Hosting and everything else must NOT try to support
pluggable or third-party (Autofac-style) containers, and `DefaultServiceProviderFactory` is
deliberately unported. _Owner-decided._

## §84 — Per-builder build-time state rides the builder's `properties` bag

When a hosting-builder augmentation needs to stash state for `build()` to read later (e.g. the
`ServiceProviderOptions` from `useDefaultServiceProvider`), it goes in `IHostBuilder.properties` —
the Map the builder already exposes and threads into the context — under a module-private `Symbol`
key. That bag exists for exactly this per-builder build-time state. (§24: with no pluggable
containers, the factory seam that would otherwise carry these is inert.) _Owner-approved._
