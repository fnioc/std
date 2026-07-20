# @rhombus-std/di.transformer

**The compile-time companion for `@rhombus-std/di` — it writes your dependency signatures for you.**

Hand-writing a dependency-injection registration means typing out a token string and a parameter-token array yourself: `add('pkg:IUserRepo', SqlUserRepo, [['pkg:ILogger', 'pkg:IDbConnection']])`. That's correct and complete on its own — but tedious and easy to get out of sync as constructors change. This transformer reads your TypeScript types at compile time and generates that array for you, so you can write `add<IUserRepo>(SqlUserRepo)` instead and get the exact same output.

## Install

```sh
bun add @rhombus-std/di.transformer
bun add @rhombus-std/di.core
```

Importing `@rhombus-std/di.transformer` (or listing it in your `tsconfig.json`'s `types` array) brings the type-driven authoring forms below — `add<I>(C)`, `.as<"x">()`, and friends — into scope for typechecking, no build plugin required. The package itself ships only that type-only `declare module` augmentation plus the brand types it re-exports; the actual lowering of those calls into plain, tokenized JavaScript is done by an optional build-time Go/`ttsc` engine, the same one this repo builds its own packages with.

## Usage

Write the type-driven registration form:

```ts
class SqlUserRepo implements IUserRepo {
  constructor(
    private log: ILogger,
    private db: IDbConnection,
  ) {}
}

services.add<IUserRepo>(SqlUserRepo).as<'request'>();
```

The transformer rewrites that call, at compile time, into the plain-data form a hand author would otherwise have to type themselves:

```ts
services
  .add('pkg:IUserRepo', SqlUserRepo, [['pkg:ILogger', 'pkg:IDbConnection']])
  .as('request');
```

Both forms run identically at resolve time — the transformer only saves you from writing the second one by hand. If you never install the transformer, `add<I>(C)` still needs a dependency signature to resolve correctly; without it you'd write the explicit form directly, or use `addFactory`/`addValue`.

## Key exports

| Export                                                          | What it's for                                                                                                                                            |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Inject<T, "tok">`                                              | Pins an explicit token onto a constructor parameter the transformer can't otherwise derive one for — an anonymous structural type with no name.          |
| `Hole<N, C>` / `$<N>`                                           | Open-generic placeholders for registering one implementation that serves many closings; `$<N>` is sugar for `Hole<N>`.                                   |
| `Typeof<T>`                                                     | Lets an implementation see which token its own generic parameter was closed to at resolve time.                                                          |
| `OverloadedConstructorParameters<T>`, `OverloadedParameters<T>` | Overload-faithful parameter-tuple helpers, re-exported so a factory's rest parameter can be typed without a direct dependency on `@rhombus-std/di.core`. |

## What it does

For every `services.add<IFoo>(Foo).as<"scope">()` (and the other type-driven forms — `add<I>(factory)`, `addFactory<I>(factory)`, `addValue<I>(...)`, `.as<"x">()`) the transformer finds, it:

1. Reads `Foo`'s constructor parameter types via the TypeScript checker.
2. Derives a token for each parameter — `<source>:<exportName>` for a named type, an inline `{ type: "..." }` slot for a factory-shaped parameter (`() => IFoo`), an inline `{ union: [...] }` slot for a directly-written union (`A | B`), or a hard compile error for an anonymous structural type with no name and no `Inject` brand (`Inject`, from `@rhombus-std/di.core`, pins an explicit token onto such a parameter).
3. Emits that signature inline, as the registration call's third argument — nothing is hoisted to a separate metadata call.
4. Rewrites the call to the plain-data, string-token form.

A `Promise<X>`-typed dependency tokenizes honestly as `Promise<...X>` at every depth — it is never silently unwrapped to `X`. This keeps a synchronous and an async registration of the same interface distinct.

### Open generics

Type arguments are part of a token's identity: `IFoo<A>` and `IFoo<B>` derive distinct tokens (`pkg:IFoo<pkg:A>`, `pkg:IFoo<pkg:B>`), never colliding. To register one implementation that serves many closings, author it with holes using `$<N>` (sugar for `Hole<N>`) — both come from `@rhombus-std/di.core`, not this package:

```ts
import type { $ } from '@rhombus-std/di.core';

class SqlRepository<T> implements IRepository<T> {
  constructor(private db: IDbConnection) {}
}

services.add<IRepository<$<1>>>(SqlRepository<$<1>>);
```

`Typeof<T>` (also from `@rhombus-std/di.core`) lets an implementation see which token its own generic parameter was closed to at resolve time:

```ts
import type { Typeof } from '@rhombus-std/di.core';

class SqlRepository<T> implements IRepository<T> {
  constructor(
    private db: IDbConnection,
    private entityToken: Typeof<T>,
  ) {}
}
```

A service token's type arguments must be **all holes or all concrete** — mixing the two (`IRepository<$<1>, User>`) is a compile error. Dependency types inside the constructor body may mix holes and concrete types freely.

### Diagnostics

The transformer surfaces several statically-detectable mistakes as compile-time diagnostics, each anchored at the offending source location — a factory whose declared parameter count doesn't match its target constructor, an anonymous type it can't derive a token for, an unbound generic type parameter, a service token that mixes holes and concrete arguments, and a dependency hole that isn't bound anywhere in the service token. Every check is conservative: it fires only when a mismatch is statically certain.

### The manual escape hatch

There's no annotation that opts a class out of the transformer, because a dependency signature lives on the registration call that emits it, not on the class itself. The transformer only rewrites the type-driven authoring forms — `add<I>(C)`, `add<I>(factory)`, `addFactory<I>(factory)`, `addValue<I>(C)`, `.as<"x">()`. Write the already-lowered explicit form yourself (`add('my:token', MyClass, [[...]])`) and the transformer leaves it untouched, since it only ever matches a call whose value argument is type-driven.

If the transformer can't statically inspect a constructor at all (a class reference passed through a variable, for instance), the registration lowers with no signature array, and `@rhombus-std/di` throws a clear error at resolve time naming the missing signature and how to supply one — as the inline third argument, via a factory, or by compiling with this transformer.

## How it fits

`@rhombus-std/di.transformer` depends on [`@rhombus-std/primitives.transformer`](../primitives.transformer/README.md) so `ttsc` activates its `nameof`/`inline`/`signatureof` stages alongside this package's own registration-lowering stage — the two run together, in one build-time pass. Its `declare module` augmentation extends the authoring surface of [`@rhombus-std/di.core`](../di.core/README.md), which is why installing `@rhombus-std/di.transformer` is what makes `add<IFoo>(Foo)` and `.as<"scope">()` available on a `ServiceManifest` in the first place — a side-effect import (`import '@rhombus-std/di.transformer'`, done automatically when you import anything else from the package) is what wires it in.

At runtime, everything this transformer lowers is consumed by [`@rhombus-std/di`](../di/README.md) — the actual resolution engine, scopes, and open-generic closing. `@rhombus-std/di.transformer.options` is a satellite that lowers the `addOptions<T>()` sugar the same way, activated by the same build-time engine so both agree on the same tokens for the same program.

You never need this package to _consume_ a library that was compiled with it — a library built with the transformer publishes plain, already-lowered JavaScript, so its registrations work in any consumer, transformer or not. Install `@rhombus-std/di.transformer` only in the project whose own classes you want auto-tokenized.

## Notes

- Tokens do not embed a package's version. Two compatible versions of the same package unify on the same token, which is the common case; two genuinely _incompatible_ versions installed side by side will collide on the same token rather than resolving into two isolated containers — the same trade-off any peer dependency carries.
- Factory detection is purely syntactic: an inline function-type annotation (`() => IFoo`) is treated as a factory, while a named callable interface with an identical shape is not. Use the named-interface form when you want a normal (non-factory) token instead.
