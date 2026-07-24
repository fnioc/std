# @rhombus-std/primitives.extras

**A compile-time transformer that turns `tokenfor<T>()` into a stable string
token for a TypeScript type — no reflection, no decorators, no runtime cost.**

Libraries that key things by type (a dependency-injection container, an
augmentation registry, anything that needs "the identity of this interface" as
a plain string) need a token that is stable across a rename-resistant type
reference. Hand-writing those strings works, but it's brittle: rename the
type, forget to update the string, and things silently stop matching. This
package gives you a `tokenfor<T>()` call that a build-time transformer rewrites,
at compile time, into the exact token string you'd otherwise have had to write
by hand.

It has no dependency on any dependency-injection runtime — it's the
standalone token-derivation toolkit that any package can use to mint tokens
from types.

## Install

```sh
bun add @rhombus-std/primitives.extras @rhombus-std/primitives
```

`primitives.extras` supplies the build-time engine; `tokenfor<T>()` itself is an ordinary
import from `@rhombus-std/primitives` (below) — you need both packages.

## Usage

The explicit form — passing a token string directly — is the real, complete
API. It works everywhere, with or without a build step:

```ts
const token = 'my-package:IUserRepository';
```

`tokenfor<T>()` is optional sugar over exactly that: write the type instead of
the string, and let the transformer fill in the string for you.

```ts
import { tokenfor } from '@rhombus-std/primitives';

interface IUserRepository {
  findById(id: string): Promise<User>;
}

const token = tokenfor<IUserRepository>();
// compiled to: const token = "my-package:IUserRepository";
```

Calling `tokenfor<T>()` without the build-time engine wired up throws a clear error naming the
missing plugin at runtime — it never silently returns `undefined`. An optional Go/`ttsc` engine
lowers the call, at build time, into exactly the string literal shown above.

## Token grammar

A token is a plain string, `<source>:<exportName>`, derived from where the
type is actually declared and how a caller would import it:

- a type exported from a package's public entry tokenizes to that package's
  exact import specifier (`my-package:IUserRepository`, or
  `my-package/contracts:IUserRepository` for a subpath export);
- a type that's only internal to a package (owned by a `package.json`,
  not publicly exported) tokenizes to a package-qualified path;
- a type with no owning `package.json` falls back to a best-effort
  project-relative path.

Generic references close over their arguments recursively —
`tokenfor<Array<IUserRepository>>()` derives `Array<my-package:IUserRepository>`
— and literal types (`tokenfor<"dev" | "prod">()`) derive a sorted,
`|`-joined literal token. The package version is deliberately excluded, so
compatible versions of the same dependency unify on one token.

## Key exports

This package has no JavaScript API of its own — it's a build-time-only Go/`ttsc` engine
descriptor. The one thing you actually import, `tokenfor<T>()`, is exported by
[`@rhombus-std/primitives`](../primitives/README.md); see [Usage](#usage) above.

## How it fits

This package sits at the same leaf level as
[`primitives`](../primitives/README.md), but is dependency-injection-free by
design — it's a pure Go/`ttsc` engine descriptor with nothing beyond the
TypeScript compiler API underneath it.

Downstream, `di.extras` and `di.extras.options` declare it as a
dependency so `ttsc` activates its `nameof`/`inline`/`signatureof` stages
alongside their own; a dependency-injection consumer usually doesn't need to
reference this package directly. A library author minting their own
augmentation tokens, outside dependency injection entirely, can depend on it
the same way and call `tokenfor<T>()` (from
[`@rhombus-std/primitives`](../primitives/README.md)) on their own terms.

## Notes

- This package is build-time only — a pure Go/`ttsc` engine descriptor with no JavaScript API
  and no runtime footprint at all. The `tokenfor<T>()` guard-rail error lives in
  [`@rhombus-std/primitives`](../primitives/README.md), which owns the runtime stub.
- `tokenfor<T>()`'s runtime body only ever executes if the transformer isn't
  wired up; a correctly configured build never reaches it.
- `tokenfor<T>()` calls are rewritten in the same pass as `di.extras`'s own stages — the
  build-time engine runs every activated stage together in one hardcoded order, not as separate
  plugins racing to rewrite the same call.
