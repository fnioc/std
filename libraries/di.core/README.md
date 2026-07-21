# @rhombus-std/di.core

**The dependency-injection abstractions a library author depends on to declare registrations, without pulling in a resolution engine.**

`@rhombus-std/di.core` carries the dependency-signature data format, the token grammar for open generics, the registration builder (`ServiceManifest`), and the registration-time errors. If you're writing an application, you'll normally install [`@rhombus-std/di`](../di/README.md) instead, which re-exports everything here plus the engine that actually resolves things. Install `di.core` directly when you're authoring a library that needs to _describe_ registrations — a plugin, a set of default services, a test helper — without depending on how they get resolved.

## Install

```sh
bun add @rhombus-std/di.core
```

Building the actual `IServiceProvider` still requires `@rhombus-std/di` — `di.core` ships the collection, not the engine. A plugin-less application installs both:

```sh
bun add @rhombus-std/di.core @rhombus-std/di
```

## Usage

Authoring a signature by hand — the third argument to `add` is **required**, because without the transformer there is nothing to derive it from:

```ts
import { ServiceManifest } from '@rhombus-std/di';

class Handler {
  constructor(private logger: ILogger, private db: IDb) {}
}

let services = new ServiceManifest();

services = services.add('pkg:IHandler', Handler, [
  ['pkg:ILogger', 'pkg:IDb'], // one array per constructor overload
]);

const provider = services.build();
```

Note the reassignment. **A manifest is immutable**: `add` / `addFactory` / `addValue` return a _new_ manifest and leave the receiver untouched, so a call whose result is discarded registers nothing. A service with no dependencies states that explicitly as `[[]]` — an empty signature list, never an omitted argument.

There is no global metadata store and no decorator: the dependency signature travels with the registration itself, as the third argument. `@rhombus-std/di.transformer` emits this array automatically for every registration it can statically read a signature from, rewriting the type-driven `add<IHandler>(Handler)` into exactly the explicit-token call above — nothing is hoisted, and nothing works differently with or without the transformer wired in.

## Key exports

| Export                                                                                               | Kind                 | Description                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Token`                                                                                              | Type alias           | `string` — the DI key type. No branding, no literal types.                                                                                                      |
| `ServiceManifest<S>`                                                                                 | Interface            | The immutable registration collection: `add` / `addFactory` / `addValue`, each returning a NEW manifest. Also an `Iterable<ManifestEntry>`.                     |
| `ServiceManifestClass`                                                                               | Class                | The concrete implementation of `ServiceManifest`. Augmentations from sibling packages patch new methods onto it.                                                |
| `AddChain<S, Slots>`                                                                                 | Type alias           | What a registration call returns: a full manifest widened with the fluent modifier faces (`as` / `withKey` / `withSignature`) for the slots still unfilled.     |
| `Slot`                                                                                               | Type alias           | `'signature' \| 'scope' \| 'key'` — the three facets a chain node can still refine. Each may be filled at most once, in any order.                              |
| `ManifestEntry`                                                                                      | Type alias           | One registration as it comes out of a manifest's iteration — an `exact` token→`Registration` or an `open` base→`OpenRegistration`.                              |
| `IResolver`                                                                                          | Interface            | The minimal resolution surface — `resolve`, `tryResolve`, `resolveAsync`, `resolveFactory`, `isService`. What a factory parameter typed `IResolver` receives.   |
| `IServiceProvider<S>`                                                                                | Interface            | The public container surface a consumer holds — composes `IResolver`, scope creation, and disposal. `build()` (from `@rhombus-std/di`) returns this.            |
| `IRequiredResolver` / `IServiceQuery`                                                                | Interfaces           | The throwing-resolve and registration-query capabilities `IResolver` composes.                                                                                  |
| `RESOLVER_TOKEN` / `isProviderToken`                                                                 | Const / function     | The intrinsic token a `IResolver`-typed parameter derives — "give me the live provider" is plain DI, no special slot kind.                                      |
| `FactoryRef`                                                                                         | Interface            | `{ type, params? }` — marks a constructor parameter to be injected as a factory rather than a resolved instance.                                                |
| `Union` / `union(...)`                                                                               | Interface / function | A slot that tries several alternatives in order and resolves to the first one registered.                                                                       |
| `DepSlot` / `DepRecord`                                                                              | Type aliases         | The positional-slot union (`Token \| FactoryRef \| Union \| LiteralRef \| TypeArgRef`) and the per-registration signature-array shape.                          |
| `Inject<T, K>`                                                                                       | Type alias           | Phantom brand — pins a specific token for one constructor parameter without changing its value type.                                                            |
| `Hole<N, C>` / `$<N>`                                                                                | Type aliases         | Compile-time placeholders standing in for the `N`th type argument of an open-generic template.                                                                  |
| `$1` … `$9`                                                                                          | Type aliases         | Pre-instantiated, non-generic aliases for the 9 most common holes — `$1` = `Hole<1>`, … `$9` = `Hole<9>`. `$<N>` remains the only spelling for `N ≥ 10`.        |
| `Typeof<T>`                                                                                          | Type alias           | Phantom brand — a constructor parameter that receives the _token string_ of type argument `T`.                                                                  |
| `closeToken` / `parseToken` / `isOpenToken` / `substituteToken` / `substituteSignatures` / `typeArg` | Functions            | The open-generic token grammar: render, parse, detect, and substitute closed/open generic tokens.                                                               |
| `EmptyServiceProvider`                                                                               | Const                | A null-object `IServiceProvider` with no application services registered.                                                                                       |
| `ActivatorUtilities`                                                                                 | Const                | Activates an unregistered class against a provider, injecting its dependency slots — for controllers, middleware, or anything the container doesn't itself own. |
| `DiError` / `OpenTokenRegistrationError` / `ActivationError`                                         | Classes              | The registration-time and activation-time error taxonomy. Resolution-time errors live in `@rhombus-std/di`.                                                     |
| `ServiceCollectionDescriptorExtensions`                                                              | Const                | Side-effect import — see below. Installs `removeAll` / `tryAdd*` / `replace*` onto every `ServiceManifest`.                                                     |

### `Token`

A plain `string` — the DI key identifying an interface. Generated by the transformer at build time; passed explicitly in plugin-less usage.

### `FactoryRef`

Marks a constructor parameter to be injected as a factory rather than a resolved instance:

```ts
export interface FactoryRef {
  readonly type: Token;
  readonly params?: readonly Token[];
}
```

`type` is the token of the produced type `T`. `params` is the complete, authored-order list of caller-supplied parameter tokens — passing it pins the factory's shape so it no longer drifts as registration state changes. Omit `params` to get a strict zero-arg `() => T` where every slot must resolve from the container.

### The provider as a resolvable type

The provider is an intrinsically resolvable type — no dedicated slot kind. A parameter typed `IResolver` derives the ordinary token `RESOLVER_TOKEN`, and the engine resolves it to the nearest open scope's provider view rather than a registration, so "I want the provider" is plain DI. A plugin-less author hand-feeds the exported constant in a signature:

```ts
import { RESOLVER_TOKEN } from '@rhombus-std/di.core';

services = services.addFactory('app/IReport', (sp) => buildReport(sp), [[
  RESOLVER_TOKEN,
]]);
```

`isProviderToken(token)` is the runtime predicate the engine uses.

### `Union`

A slot that tries each member in declaration order and resolves to the first one that is registered:

```ts
export interface Union {
  readonly union: readonly DepSlot[];
}
```

Members are tried in array order (first = highest precedence). If no member is resolvable, resolution throws. Each member is itself a `DepSlot`, so nesting is allowed.

```ts
services = services.add('pkg:IHandler', Handler, [[
  union('pkg:IRedis', 'pkg:IMemoryCache'),
  'pkg:ILogger',
]]);
```

### `Inject<T, K extends Token>`

A phantom brand type. Pins the token for one constructor or factory parameter without changing the value type:

```ts
declare const TOK: unique symbol;
export type Inject<T, K extends Token> = T & { readonly [TOK]?: K; };
```

The brand is optional — a plain `T` is still assignable, and it costs nothing at runtime.

```ts
class Handler {
  constructor(
    a: Inject<ICache, 'pkg:redis-cache'>,
    b: ILogger,
  ) {}
}
```

Use it as the escape hatch for anonymous or purely structural types the transformer can't otherwise tokenize — `Inject<{ n: number }, 'my:opts'>`. Named types (interfaces, classes, primitive keywords) derive a token on their own and don't need it.

### `Hole<N, C>` and `$<N>`

Compile-time placeholders standing in for the `N`th type argument of an open-generic template (1-based):

```ts
declare const HOLE: unique symbol;
export type Hole<N extends number, C = unknown> = C & { readonly [HOLE]?: N; };
export type $<N extends number> = Hole<N>;
```

`$<N>` is unbounded sugar for the common unconstrained case. Write `Hole<N, C>` directly when the implementation's type parameter carries a constraint the placeholder needs to satisfy — `Hole<1, Entity>` **is** an `Entity`, letting a constrained implementation like `class SqlRepository<T extends Entity>` accept a placeholder as its type argument:

```ts
services.add<IRepository<$<1>>>(SqlRepository<Hole<1, Entity>>);
```

For the overwhelmingly common unconstrained case with 9 or fewer holes, the pre-instantiated bare aliases `$1` … `$9` (`$1` = `Hole<1>`, … `$9` = `Hole<9>`) drop one more pair of angle brackets:

```ts
export type $1 = Hole<1>;
// … through $9 = Hole<9>
```

```ts
services.add<IRepository<$1>>(SqlRepository<$1>);
```

This mirrors how shell/regex backreference syntax treats `$1`-`$9` as directly usable bare identifiers while reserving a bracketed/braced form (`${10}`, `$<10>`, etc.) for everything beyond. `$<N>` stays exactly as it is — the only spelling for `N ≥ 10`, and still usable at any `N` for anyone who prefers the generic form.

Zero runtime footprint — these are pure compile-time brands read structurally by `@rhombus-std/di.transformer`.

### `Typeof<T>`

A phantom brand marking a constructor parameter that receives the **token string** of type argument `T`:

```ts
declare const ARG: unique symbol;
export type Typeof<T> = Token & { readonly [ARG]?: T; };
```

The value type stays `Token` (a plain string) — the brand property is optional, so any string is assignable.

```ts
class SqlRepository<T> implements IRepository<T> {
  constructor(
    private db: IDbConnection,
    private entityToken: Typeof<T>,
  ) {}
}

services.add<IRepository<$<1>>>(SqlRepository<$<1>>);

const userRepo = scope.resolve<IRepository<User>>();
// userRepo.entityToken === "pkg:User"
```

`typeArg(n)` is its manual-authoring counterpart — build a `{ typeArg: n }` slot by hand when writing an open registration's signature array directly.

### `DepSlot`

One positional slot in a constructor signature:

```ts
export type DepSlot =
  | Token
  | FactoryRef
  | Union
  | LiteralRef
  | TypeArgRef;
```

- `Token` — a container-resolved dependency (registered), or a caller-supplied parameter (unregistered) — the live registration map decides which at resolve time. The intrinsic provider token resolves to the live provider view.
- `FactoryRef` — a factory-injected parameter.
- `Union` — member-level alternatives; first resolvable wins.
- `LiteralRef` — a literal or nullish-singleton value, injected directly, no lookup.
- `TypeArgRef` — the token string of an open registration's `N`th type argument; substituted to a `LiteralRef` when the template is closed.

### `DepRecord`

The shape of a registration's carried dependency metadata:

```ts
export interface DepRecord {
  readonly signatures: readonly (readonly DepSlot[])[];
}
```

`signatures` holds one or many signature arrays, supporting constructor overloads: the engine picks the first satisfiable one, scanned longest to shortest.

### Authoring signatures by hand

There's no global metadata store and no decorator. A signature rides directly on the registration, as the required third argument to `add` / `addFactory`:

```ts
import { ServiceManifest } from '@rhombus-std/di';

let services = new ServiceManifest();

services = services.add('pkg:IHandler', Handler, [
  ['pkg:ILogger', 'pkg:IDb'],
]);
```

Because the array is keyed on the **registration record**, not on the constructor function, one class can back any number of independent registrations with different signatures — the mechanism open-generic registrations depend on, where the same erased class serves every closing of a template.

## Open-generic token grammar

Closing a generic is token algebra, not runtime type machinery — TypeScript generics are erased, so there's exactly one JS class per generic implementation. `@rhombus-std/di.transformer` renders this grammar at build time; the functions below are how a resolve-time fallback (or any hand-written manual registration) works with it directly.

**Closed-generic grammar:** `base<arg1,arg2>` — no whitespace around `<` `>` `,`. Each arg is itself a token, so nesting recurses (`pkg:IFoo<pkg:IBar<./src/Baz>>`). A **hole** is an arg that is exactly `$N` (decimal, `N ≥ 1`); a token containing a hole at any depth is an _open template_. Literal-type args keep their interior spaces/quotes (`"a" | "b"`) — the parser is quote-aware, so commas and angle brackets inside double quotes never count as separators.

```ts
closeToken('pkg:IRepository', 'pkg:User'); // "pkg:IRepository<pkg:User>"
closeToken('pkg:IMap', 'string', '$1'); // "pkg:IMap<string,$1>"

parseToken('pkg:IRepository<pkg:User>');
// { base: "pkg:IRepository", args: ["pkg:User"] }

isOpenToken('pkg:IRepository<$1>'); // true

substituteToken('pkg:IRepository<$1>', ['pkg:User']);
// "pkg:IRepository<pkg:User>"
```

- `closeToken(base, ...args)` renders the canonical form. With no args, returns `base` unchanged.
- `parseToken(token)` splits a closed-generic token into `{ base, args }`. Returns `undefined` for non-generic or malformed input — callers fall through to normal exact-match handling either way.
- `isOpenToken(token)` is `true` when `token` contains a hole at any depth.
- `substituteToken(template, args)` is grammar-aware, recursive substitution — not a naive string replace. Throws `RangeError` if the template references a hole beyond the supplied args.
- `substituteSignatures(signatures, args)` substitutes `args` through every slot of every signature — the whole-record counterpart used to close an open registration's carried dependency signatures.

## The registration builder

`ServiceManifest<S>` is the collection interface a consumer holds; `ServiceManifestClass` is its concrete implementation. Three registration surfaces:

- **`add(token, ctor, signatures)`** — a class; its constructor dependencies are injected per `signatures`.
- **`addFactory(token, factory, signatures)`** — a factory function; its call-parameter dependencies are injected per `signatures`.
- **`addValue(token, value)`** — an already-built instance; no dependencies, no lifetime.

`add` and `addFactory` take two further optional positional arguments — `scope` then `key` — and that's the shape to reach for by default:

```ts
let services = new ServiceManifest<'singleton' | 'request'>();
services = services.add('pkg:ILogger', ConsoleLogger, [[]], 'singleton');
```

### Immutability

A manifest never mutates. Every registration returns a **new** manifest that yields this one's registrations first and its own last, so iteration order is authoring order and the receiver is left exactly as it was. Two consequences worth internalising:

- **Keep the result.** `services.add(...)` on its own line registers nothing — the new manifest is discarded. Declare the variable `let` and reassign it.
- **Forking is free.** Two branches off the same manifest never see each other's registrations, so a base manifest can be handed to several independent setup functions.

### The fluent chain

What a registration call returns is a full manifest _widened_ with a modifier face for each argument you didn't pass positionally — `withSignature` for `signature`, `as` for `scope`, `withKey` for `key`. Each consumes its own slot, so a slot can be set at most once, and the modifiers compose in any order:

```ts
services = services.add('pkg:ILogger', ConsoleLogger, [[]]).as('singleton')
  .withKey('audit');
services = services.add('pkg:ILogger', ConsoleLogger, [[]]).withKey('audit').as(
  'singleton',
);
```

Both register the same thing, and `.as(...).as(...)` is a compile error. Because the chain node _is_ a manifest, `add` and `build` are reachable at every step — a chain never has to be "finished". Reach for the fluent form when the facets genuinely arrive out of order; the positional call is one call and one reassignment.

`.as(scope)` REPLACES its own node rather than appending one, so `add(...).as('singleton')` stays exactly **one** registration — a stray transient shadow would be invisible to last-wins resolution but would show up in collection aggregation, which enumerates every registration of a token.

There's no built-in root scope — scope names are entirely user-declared tags. `'transient'` isn't a member of that union; transient is what you get when a registration's tagged scope isn't open at resolution time, not a scope you name.

An **open** template token (`pkg:IRepo<$1>` — every type argument a hole) routes into a separate open-registration table instead of the exact map; resolution closes it per requested token. Mixing concrete args and holes in the same service token throws — from the registration call itself, including from a `.withKey(...)` whose recomposed token turns out to be open.

`services.seal()` materialises the collection by iterating it, bucketing the entries into two frozen lookup indexes; `services.build(options?)` (added by `@rhombus-std/di`) seals and constructs the actual `IServiceProvider`. Calling `build()` without importing `@rhombus-std/di` throws, naming the missing import.

## `ActivatorUtilities`

Activates a class the container does **not** know about, pulling its constructor dependencies from a provider — for controllers, middleware, or anything else you want to construct on demand rather than register up front.

```ts
import { ActivatorUtilities } from '@rhombus-std/di.core';

const handler = ActivatorUtilities.createInstance(
  provider,
  RequestHandler,
  ['pkg:ILogger', 'pkg:IDb'],
);
```

- `createInstance(provider, ctor, signature?, ...args)` — builds one instance now. Signature slots the provider can satisfy resolve from it; any slot it can't is filled from `args`, left to right.
- `createFactory(ctor, signature?)` — pre-builds a reusable `ObjectFactory`: `(provider, args?) => T`, producing a fresh instance on every call.
- `getServiceOrCreateInstance(provider, token, ctor, signature?)` — returns the token's registered service if there is one, otherwise activates `ctor`.

Signatures here are hand-fed the same way as `add`'s third argument — there's no runtime reflection to read a constructor's parameter types from. (`ActivatorUtilities` is the one place the signature stays optional: it activates a class the manifest never saw, so there is no registration record for it to ride on.)

## Side-effect import: descriptor mutation verbs

```ts
import '@rhombus-std/di.core';
```

Just importing the package's entry point registers `removeAll`, `tryAdd` / `tryAddFactory` / `tryAddValue`, and `replace` / `replaceFactory` / `replaceValue` onto every `ServiceManifest`:

```ts
services = services.removeAll('pkg:ILogger');

services = services.tryAdd('pkg:ILogger', ConsoleLogger, [[]]); // only if unregistered
services = services.replace('pkg:ILogger', FileLogger, [[]], 'singleton'); // drop, then register anew
```

Like every registration verb, each of these returns a **new** manifest — keep the result.

- `removeAll(token)` returns a manifest with every registration bound to `token` dropped.
- `tryAdd` / `tryAddFactory` / `tryAddValue` register only when `token` has no existing registration; when it does, they return the receiver **unchanged**, which under an immutable manifest is exactly the right no-op.
- `replace` / `replaceFactory` / `replaceValue` unconditionally drop `token`'s existing registrations, then register anew.

The class/factory verbs mirror `add`'s positional shape (`signatures`, then optional `scope`, then optional `key`) rather than returning a fluent chain — the already-registered branch has no pending registration to hand a modifier face for. There's no lifetime-named verb (`tryAddSingleton`, etc.): lifetime is a `Scopes` argument, the same as on ordinary `add`.

## How it fits

- [`@rhombus-std/primitives`](../primitives/README.md) — the zero-dependency leaf `di.core` depends on for the augmentation registry that installs cross-package registration verbs.
- [`@rhombus-std/di`](../di/README.md) — the runtime resolution engine. Depends on `di.core`, re-exports its authoring surface, and adds `build()` plus scopes, captive-dependency protection, and disposal. Install this alongside `di.core` for an actual application.
- [`@rhombus-std/di.transformer`](../di.transformer/README.md) — the optional compile-time plugin that lowers the type-driven authoring forms (`add<I>(C)`, `addValue<I>(v)`, `resolve<T>()`) into the explicit-token calls this package documents. Depends on `di.core`'s types only, never the runtime engine.
- [`@rhombus-std/di.transformer.options`](../di.transformer.options/README.md) — a satellite of the transformer above, lowering the `addOptions<T>()` sugar.

Many other packages in the family (options, logging, caching, hosting, and more) register their own fluent methods onto `ServiceManifest` the same way this package's descriptor verbs do — install them and they show up on the same collection you're already building.

## Notes

- **The transformer never adds a capability.** Every type-driven authoring form it rewrites (`add<I>(C)`, `addFactory<I>(fn)`, `addValue<I>(v)`) lowers to exactly the explicit-token call shown throughout this README. Calling the type-driven form without the transformer wired into your build throws a `TypeError` naming the missing plugin, rather than silently doing nothing.
- **`build()` needs `@rhombus-std/di`.** `di.core` ships the registration collection only; `ServiceManifest.build()` is a stub that throws until `@rhombus-std/di` has been imported somewhere in the program (importing it prototype-patches `build()` in).
