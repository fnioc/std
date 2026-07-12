# @rhombus-std/primitives.transformer

**A compile-time transformer that turns `nameof<T>()` into a stable string
token for a TypeScript type — no reflection, no decorators, no runtime cost.**

Libraries that key things by type (a dependency-injection container, an
augmentation registry, anything that needs "the identity of this interface" as
a plain string) need a token that is stable across a rename-resistant type
reference. Hand-writing those strings works, but it's brittle: rename the
type, forget to update the string, and things silently stop matching. This
package gives you a `nameof<T>()` call that a ts-patch plugin rewrites, at
compile time, into the exact token string you'd otherwise have had to write by
hand.

It has no dependency on any dependency-injection runtime — it's the
standalone token-derivation toolkit that any package can use to mint tokens
from types.

## Install

```sh
bun add @rhombus-std/primitives.transformer
```

## Usage

The explicit form — passing a token string directly — is the real, complete
API. It works everywhere, with or without a build step:

```ts
const token = 'my-package:IUserRepository';
```

`nameof<T>()` is optional sugar over exactly that: write the type instead of
the string, and let the transformer fill in the string for you.

```ts
import { nameof } from '@rhombus-std/primitives.transformer';

interface IUserRepository {
  findById(id: string): Promise<User>;
}

const token = nameof<IUserRepository>();
// compiled to: const token = "my-package:IUserRepository";
```

Wire the plugin into `tsconfig.json` and build/typecheck with `tspc` (the
ts-patch–patched `tsc`):

```jsonc
{
  "compilerOptions": {
    "plugins": [
      {
        "transform": "@rhombus-std/primitives.transformer",
        "import": "transform",
      },
    ],
  },
}
```

Without the plugin wired up, calling `nameof<T>()` at runtime throws a clear
error naming the missing plugin — it never silently returns `undefined`.

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
`nameof<Array<IUserRepository>>()` derives `Array<my-package:IUserRepository>`
— and literal types (`nameof<"dev" | "prod">()`) derive a sorted,
`|`-joined literal token. The package version is deliberately excluded, so
compatible versions of the same dependency unify on one token.

## Key exports

| Export                                                                                                                                                                                                 | What it is                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nameof<T>()`                                                                                                                                                                                          | Compile-time token for a type; rewritten to a string literal by the plugin. Throws a descriptive error if called without the plugin.                                   |
| `createNameofTransformerFactory(program, options?)`                                                                                                                                                    | Builds the `ts.TransformerFactory` that rewrites `nameof<T>()` calls in a program — the ts-patch entry, also usable directly to drive the transform in a test harness. |
| `transformer` (default export) / `transform`                                                                                                                                                           | The ts-patch plugin entry points referenced by `tsconfig.json`'s `plugins` array.                                                                                      |
| `createTokenContext(program, options?)`                                                                                                                                                                | Builds the `TokenContext` (checker, project root, package-export index) that the derivation functions below need.                                                      |
| `deriveToken(type, context, failure?)`                                                                                                                                                                 | Derives the token string for a `ts.Type` given a `TokenContext`. The function `nameof<T>()` compiles down to.                                                          |
| `tokenForType(type, context, failure?)`                                                                                                                                                                | Classifies a constructor-parameter type into a token result — used by tools that extract dependencies from a signature.                                                |
| `tokenForReturnType(signature, context)`                                                                                                                                                               | The token for an inline function type's return type — for factory-shaped parameters (`() => IFoo`).                                                                    |
| `parseToken(token)` / `isOpenToken(token)`                                                                                                                                                             | Parse a closed-generic token string into its base and arguments, or check whether it still contains an unresolved hole (`$N`).                                         |
| `intrinsicToken(type)`, `singletonValue(type)`, `isPureLiteralUnion(type)`, `literalUnionTokenForOptional(type)`, `baseTokenForSymbol(symbol, context)`, `injectTokenFor`, `holeNumberFor`, `stripExt` | Lower-level derivation building blocks, for a library building its own token-minting logic on top of this one's rules rather than calling `deriveToken` directly.      |

## How it fits

This package sits at the same leaf level as
[`primitives`](../primitives/README.md), but is dependency-injection-free by
design: it depends on nothing beyond the TypeScript compiler API. Any family
that wants to mint tokens from types — not just dependency injection — can
build on it directly.

Downstream, `di.transformer` and `di.transformer.options` consume this
package as their token-derivation engine and re-export a curated subset of
its surface, so a dependency-injection consumer usually doesn't need to
depend on this package directly — but a library author building their own
augmentation-token machinery, outside dependency injection entirely, can use
`nameof<T>()` and the derivation functions above on their own terms.

## Notes

- This package is build-time only — it's a `peerDependency` on `typescript`
  and does no work at runtime beyond the `nameof<T>()` guard-rail error.
- `nameof<T>()`'s runtime body only ever executes if the transformer isn't
  wired up; a correctly configured build never reaches it.
- Rewriting is idempotent if a program is also configured with `di.transformer`
  — whichever plugin runs first consumes each `nameof<T>()` call; the other
  simply finds none left to rewrite.
