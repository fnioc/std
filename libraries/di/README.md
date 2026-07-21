# @rhombus-std/di

**A dependency-injection container built on string tokens, not decorators.**

Register classes, factories, and values against tokens; resolve a graph of instances with correct scope lifetimes, cycle detection, and native disposal. No `reflect-metadata`, no runtime type introspection — tokens and dependency arrays are either written by hand or generated once at compile time by an optional transformer.

## Install

```sh
bun add @rhombus-std/di @rhombus-std/di.core @rhombus-std/primitives
```

`@rhombus-std/di.core` carries the registration-builder types this package re-exports; `@rhombus-std/primitives` is the shared runtime dependency both packages build on. Add `@rhombus-std/di.transformer` alongside if you want the type-driven `add<IFoo>(Foo)` sugar — it's optional, and everything below works without it.

## Usage

```ts
import { ServiceManifest } from '@rhombus-std/di';

interface ILogger {
  log(msg: string): void;
}
class ConsoleLogger implements ILogger {
  log(msg: string) {
    console.log(msg);
  }
}

// A manifest is IMMUTABLE: every registration returns a NEW manifest and
// leaves the receiver alone, so the result has to be kept.
const services = new ServiceManifest<'singleton'>()
  .add('app:ILogger', ConsoleLogger, [[]], 'singleton');

const provider = services.build(); // frameless — nothing pre-opened
const app = provider.createScope('singleton'); // open the singleton frame

const logger = app.resolve<ILogger>('app:ILogger');
logger.log('hello'); // -> "hello"

app.dispose();
```

This is the hand-written, no-transformer form: `add(token, Ctor, signatures, scope?)` takes a plain string token, a constructor, the constructor's dependency signatures, and optionally the lifetime scope; `build()` seals the registration map into a provider; and `createScope(name)` opens a scope frame that owns and caches singleton instances. With the optional transformer, `services.add<ILogger>(ConsoleLogger).as<'singleton'>()` lowers to exactly the call shown above.

**Everything returns a new manifest.** The chain never mutates, so a bare
`services.add(...)` statement registers _nothing_ — its result is the only place
the registration exists:

```ts
let services = new ServiceManifest<'singleton'>();
services = services.add('app:ILogger', ConsoleLogger, [[]], 'singleton'); // kept
services.add('app:IClock', SystemClock, [[]]); // SILENTLY REGISTERS NOTHING
```

## Design philosophy — scopes are uniform tags

**Scopes are uniform tags — there is no root.** `"singleton"` is literally just a tag you happen to open once at the top. You can run the container without ever opening a scope at all; with no matching frame open, resolution is transient.

`build()` returns a **frameless** provider — nothing is pre-opened, and there is no provider-level instance cache. A registration's lifetime tag caches its instance in the nearest enclosing **open** frame carrying that tag; if no such frame is open, the instance resolves transiently (fresh, no cache, no error) — exactly like an untagged registration. Open a frame with `createScope(name)` when you want a tag to cache. Captive-dependency safety is preserved structurally: a service's deps resolve relative to the frame that owns it, so a longer-lived service can never cache-capture a shorter-lived one — it gets a fresh transient instead.

## Key exports

| Export                                                                                                                                                                                                                                                                                                                                                        | What it is                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `ServiceManifest<Scopes>`                                                                                                                                                                                                                                                                                                                                     | The immutable registration builder — `.add()` / `.addFactory()` / `.addValue()` / `.build()`.                     |
| `ServiceProviderClass`                                                                                                                                                                                                                                                                                                                                        | The concrete container implementation backing `IServiceProvider`, exported for white-box use.                     |
| `IServiceProvider<Scopes>` (type)                                                                                                                                                                                                                                                                                                                             | The public container surface: `resolve`, `resolveAsync`, `resolveFactory`, `createScope`, disposal.               |
| `IResolver`, `IScopeFactory`, `IRequiredResolver`, `IServiceQuery` (types)                                                                                                                                                                                                                                                                                    | The capability interfaces `IServiceProvider` composes.                                                            |
| `RESOLVER_TOKEN`                                                                                                                                                                                                                                                                                                                                              | The intrinsic token a `IResolver`-typed constructor parameter derives, for factories that want the live provider. |
| `ActivatorUtilities`                                                                                                                                                                                                                                                                                                                                          | Activates an unregistered class using the container's own dependency resolution.                                  |
| `EmptyServiceProvider`                                                                                                                                                                                                                                                                                                                                        | A null-object provider that resolves nothing.                                                                     |
| `closeToken`, `isOpenToken`, `parseToken`, `typeArg`, `union`                                                                                                                                                                                                                                                                                                 | Token-grammar helpers for open generics and union slots without a transformer.                                    |
| `ActivationError`, `CircularDependencyError`, `UnregisteredTokenError`, `OpenTokenResolutionError`, `OpenTokenRegistrationError`, `FactoryTargetError`, `MissingMetadataError`, `AsyncResolutionRequiredError`, `AsyncDisposalRequiredError`, `NoSatisfiableSignatureError`, `NoSatisfiableUnionError`, `RegistrationValidationError`, `ScopeValidationError` | The error types the container throws — see below for when each fires.                                             |

## `ServiceManifest<Scopes>`

The entry point. `Scopes` is the union of declarable scope-name tags (default `"singleton"`). The tags the `scope` argument, `.as()`, and `createScope()` accept are exactly its members. Transient (no cache, fresh instance on every resolve) is the default — there is no `"transient"` scope; a registration with no scope, or with no open frame for its tag, is transient.

```ts
import { ServiceManifest } from '@rhombus-std/di';

const services = new ServiceManifest<'singleton' | 'request'>();
```

Registration is append-only: each token holds a **list** of registrations in registration order, and resolution picks the most-recent (last) one. A later `add` for the same token therefore overrides an earlier one without deleting it.

The manifest itself is an **immutable iterable decorator chain**: each verb returns a new manifest that yields the previous one's entries first and its own last, so iteration order is authoring order. Nothing is ever mutated in place — thread the result (`services = services.add(...)`).

### `.add<Interface>(Concrete).as<"scope">()`

Register a concrete implementation against an interface token. The transformer rewrites `add<IFoo>(Foo)` to `add("pkg:IFoo", Foo, [[…]])` at build time — deriving the signature it injects. Hand-fed consumers pass the token string and the signature directly.

```ts
// With transformer (author form) — each call still returns a new manifest:
services = services.add<ILogger>(ConsoleLogger).as<'singleton'>();
services = services.add<IUserRepo>(SqlUserRepo).as<'request'>();
services = services.add<IRequestId>(UuidRequestId); // no .as() → transient

// Without transformer (lowered form, or plugin-less):
services = services.add('pkg:ILogger', ConsoleLogger, [[]], 'singleton');
services = services.add('pkg:IUserRepo', SqlUserRepo, [[]], 'request');
services = services.add('pkg:IRequestId', UuidRequestId, [[]]);
```

The type constraint on `Concrete` is `new (...args: any[]) => Interface` — plain `new`, not `abstract new`. Abstract classes are correctly rejected because the container instantiates the concrete.

`.as<S>()` checks at compile time that `S` is a declared scope name. Passing an undeclared string is a type error. The positional `scope` argument is checked the same way.

**Positional or fluent, never both.** A registration call hands back an `AddChain<Scopes, Slots>` — the manifest itself, widened with a modifier face for each slot the call did _not_ fill positionally (`withSignature`, `as`, `withKey`). Filling a slot consumes its face, so `.as('a').as('b')` is a compile error, while `.withKey('k').as('a')` and `.as('a').withKey('k')` both type-check. Prefer the positional form: it is one call and one assignment.

### `add<I>(Concrete, sig)` — registration-time signature override

For third-party classes (constructor not editable) or generic instantiations the transformer cannot infer, supply a positional override array alongside the class:

```ts
add<ICache>(RedisCache, ['pkg:IRedisClient', undefined, 'pkg:ILogger']);
```

`sig` is `readonly (DepSlot | undefined)[]` — a positional sparse override over the transformer-generated signature. A `DepSlot` at a position overrides the generated token there; `undefined` keeps the generated token. Use explicit `undefined` rather than sparse elision.

Pure token users (no transformer) supply a complete signature via the registration's own third argument (`add(token, C, signatures)`) instead.

### `add(token, Ctor, signatures, scope?, key?)` — registration-carried dependency signatures

Not to be confused with the sparse `sig` override above — that's a type-driven, compile-time-only feature consumed entirely by the transformer. This is the **runtime** form of `add`: a REQUIRED third argument, `signatures`, a complete (non-sparse) multi-signature array carried directly on the registration record, followed by the optional `scope` and `key` slots.

```ts
add(token: Token, ctor: Ctor, signatures: DepSignatures): AddChain<Scopes, 'scope' | 'key'>
add(token: Token, ctor: Ctor, signatures: DepSignatures, scope: Scopes): AddChain<Scopes, 'key'>
add(token: Token, ctor: Ctor, signatures: DepSignatures, scope: Scopes, key: string): IServiceManifest<Scopes>
// addFactory takes the identical three overloads with `factory: Factory` in place of `ctor`.
```

There is no global, constructor-keyed metadata store — this array **is** the sole signature channel, for both classes (`add`) and factories (`addFactory`). Keying it on the registration rather than the constructor function is what lets one JS class back **any number of independent registrations** with different signatures — the mechanism open-generic registrations depend on, where the same erased class serves every closing of a template (see [Open generics](#open-generics) below). `@rhombus-std/di.transformer` emits this array inline for every registration it can statically extract a signature from — `add<IFoo>(Foo)` lowers to `add("pkg:IFoo", Foo, [[...]])`, with no separate prelude call and nothing hoisted. Hand-write it directly for the plugin-less path.

`signatures` is **required** rather than optional, because a plugin-less caller cannot derive it: "this service takes no dependencies" has to be _stated_ as `[[]]`, never inferred from an absent argument. A constructor that does take parameters but is registered with `[[]]` throws `MissingMetadataError` at resolve time.

### `addFactory(token, factory, signatures?)` and `addValue(token, value)`

Two more registration surfaces alongside `add` — recommended for test doubles, third-party instances, and plugin-less consumers.

```ts
import { RESOLVER_TOKEN } from '@rhombus-std/di';

// Factory that wants the live IResolver: declare it as a provider-typed param
// (its slot is the intrinsic RESOLVER_TOKEN), resolve its own deps by hand.
services = services.addFactory(
  'pkg:IDb',
  (sp) => new PostgresDb(sp.resolve<IConfig>('pkg:IConfig')),
  [[RESOLVER_TOKEN]],
  'singleton',
);

// Factory with a signature: each param is injected by its slot, like `add`.
services = services.addFactory(
  'pkg:IDb',
  (config) => new PostgresDb(config),
  [['pkg:IConfig']],
  'singleton',
);

// Value: a pre-constructed instance (re-used as-is, no lifetime)
services = services.addValue('pkg:ICache', new NullCache());
```

`addFactory` takes the same positional `scope` / `key` tail as `add` — `"singleton"` caches the result in the nearest enclosing open `"singleton"` frame; no scope runs the factory fresh on every resolve (transient). A factory that wants the live `IResolver` declares it as an ordinary parameter — the provider is an intrinsically resolvable type (a `IResolver`-typed param derives `RESOLVER_TOKEN`), so "I want the provider" is plain DI. A factory registered with the empty signature `[[]]` simply runs with no injected args — nothing is auto-supplied. `addValue` takes neither signatures nor a lifetime (the value is always the same reference), only an optional trailing `key`; like every other verb it returns the new manifest.

To override a registration for a specific context (e.g. a test double), register a later spec for the same token before calling `build()`. The registration map is append-only and last-registration-wins. `build()` materializes the chain by iterating it, so what a provider contains is exactly the manifest you called `build()` on — an earlier manifest in the chain is unaffected by anything registered after it.

## Scope model

Scopes are uniform tags forming a parent-linked chain. There is no root: `build()` returns a frameless provider, and frames are opened only by an explicit `createScope` — never auto-created. `"singleton"` is just the tag you open once at the top.

```ts
const provider = services.build(); // frameless — nothing pre-opened
const app = provider.createScope('singleton'); // open the app-lifetime frame
const req = app.createScope('request'); // per HTTP request
```

**Resolution walks the enclosing chain for instance ownership:** the lifetime tag names which enclosing open frame caches the instance. Walk up to the nearest enclosing frame whose name matches the tag and cache there. (Registration lookup is flat — the sealed map is shared across the whole tree.)

**Lifetime rules:**

| Registration                     | Behavior                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------- |
| No scope (transient)             | Fresh instance on every resolve. Never cached.                                         |
| Scope `"singleton"`              | Owned and cached by the nearest enclosing **open** `"singleton"` frame.                |
| Scope `"request"`                | Owned and cached by the nearest enclosing **open** `"request"` frame.                  |
| Tag with no enclosing open frame | **Transient.** Fresh instance, no cache, no error — an absent frame is just transient. |

### Captive-dependency protection

The critical correctness rule: deps are resolved **relative to the frame that will own the instance**, not the frame that triggered the resolve. This is what keeps a longer-lived service from cache-capturing a shorter-lived one.

```ts
let services = new ServiceManifest<'singleton' | 'request'>();
services = services.add<ICache>(RedisCache).as<'singleton'>();
services = services.add<IUserContext>(HttpUserContext).as<'request'>();
services = services.add<IUserService>(UserService).as<'singleton'>();
// UserService constructor: (cache: ICache, ctx: IUserContext)

const app = services.build().createScope('singleton');
const req = app.createScope('request');

req.resolve<IUserService>('pkg:IUserService');
// UserService is singleton-owned. Its deps resolve from the singleton frame's
// chain, which has no ENCLOSING "request" frame (request is a descendant). So
// IUserContext resolves to a FRESH transient — never the request's cached
// instance. The singleton cannot capture one request's IUserContext and hold it
// across every subsequent request.
```

The construct-relative-to-owner rule guarantees a fresh transient is the worst that can happen when a longer-lived service depends on a shorter-lived one — never a captured, stale cached instance.

## Open generics

A registration whose service token contains a **hole** (`$1`, `$2`, …) is an _open_ (template) registration — it doesn't cache one instance, it matches **any** closing of its base + arity at resolve time.

```ts
// Open registration: matches any closing of IRepository<T>, one hole per arg
services = services.add<IRepository<$<1>>>(SqlRepository<$<1>>).as<
  'singleton'
>();

// Each closing resolves and caches independently
const userRepo = scope.resolve<IRepository<User>>(); // "pkg:IRepository<pkg:User>"
const orderRepo = scope.resolve<IRepository<Order>>(); // "pkg:IRepository<pkg:Order>"
// distinct singleton instances — the closed token is the cache key
```

### Registration rules

- **All-holes only.** Every type-arg position in an open service token must be a hole — `IFoo<$1,$1>` is allowed (repeats mean "match only equal args"); mixing concrete args and holes (`IFoo<$1,User>`) is a registration error.
- **Class registrations only.** `addValue`/`addFactory` reject an open token — there is no single value or factory that could serve every closing.
- **The scope tag applies per closing**, not to the template as a whole — `IRepository<A>` and `IRepository<B>` are distinct singletons, each cached in the nearest enclosing frame carrying `tag`, exactly like two unrelated `.as("singleton")` registrations.
- **Last-registered wins** among multiple open registrations matching the same base + arity (and satisfying any repeated-hole equality constraint) — same semantics as the exact-match list.

### Resolve-time fallback and memoization

Resolving a token the exact-match map has no entry for falls through, in order:

1. **Memo** — a closed token already synthesized on a previous resolve returns the _same_ `Registration` object (identity-stable — this is what makes per-closing caching correct across repeat resolves).
2. **Parse.** A non-generic token that misses here is simply unregistered.
3. **Open-table match** — search open registrations for the same base + arity (respecting repeated-hole equality), most-recently-registered first.
4. **Substitute** — the open registration's carried dependency signatures are substituted with the closing's concrete type args (`TypeArgRef` slots become `LiteralRef`s carrying the substituted token).
5. **Synthesize** a class `Registration` for the closed token — a constructor-wrapping producer that inherits the constructor and scope tag and carries the substituted signatures — and memoize it.

**Exact beats open.** An exact registration for a closed token — one you registered directly, e.g. `services = services.add<IRepository<User>>(SpecialUserRepo)` alongside the open `IRepository<$<1>>` registration — is checked _before_ the memo and the open-table fallback, so it always wins.

**Resolving a token that still contains a hole throws.** `scope.resolve("pkg:IRepository<$1>")` is not a valid resolve target — only closed tokens resolve. See `OpenTokenResolutionError` below.

### Errors

| Error                                       | Thrown when                                                                                                                                                                                                    |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OpenTokenResolutionError(token)`           | `resolve()` (directly or transitively) is asked for a token that still contains an unbound hole.                                                                                                               |
| `OpenTokenRegistrationError(token, method)` | `add()` is given a service token that mixes concrete args and holes, or `addValue()`/`addFactory()` is given any open token. `method` names the call that rejected it (`"add"`, `"addValue"`, `"addFactory"`). |

### Manual / plugin-less path

No transformer required — template tokens are just strings with `$N` holes, and the grammar helpers are plain functions:

```ts
import { closeToken, typeArg } from '@rhombus-std/di';

// Template registration — carried signatures include a TypeArgRef via typeArg(1)
services = services.add(
  'app:IRepository<$1>',
  SqlRepository,
  [['app:IDbConnection', typeArg(1)]],
  'singleton',
);

// Resolve closings by hand-closing the token
const userToken = closeToken('app:IRepository', 'app:User'); // "app:IRepository<app:User>"
scope.resolve(userToken);
```

Because the signature array lives on the **registration**, not on the constructor object, the same class can back any number of independent templates (or an open template alongside a closed override) without collision — each `add(...)` call carries its own array:

```ts
// SqlRepository backs an open template...
services = services.add('app:IRepository<$1>', SqlRepository, [[
  'app:IDbConnection',
  typeArg(1),
]]);

// ...and a second, unrelated open template for a different service base,
// with its own independent signature array. No collision: each registration
// owns its own signatures.
services = services.add('app:IAuditLog<$1>', SqlRepository, [[
  'app:IAuditConnection',
  typeArg(1),
]]);
```

## Greedy overload selection

When a registration's carried signature array holds multiple entries (one per constructor overload), the engine selects by scanning **longest → shortest** and picking the first signature where every resolvable parameter token is satisfiable (registered in the container). Equal-arity ties break by array order.

```ts
// Two overloads: prefer the one with ILogger if available
class MyService {
  constructor(logOrDb: ILogger | IDb, db?: IDb) {/* ... */}
}

services = services.add('pkg:myService', MyService, [
  ['pkg:IDb'],
  ['pkg:ILogger', 'pkg:IDb'],
]);
```

If `ILogger` is registered, the two-parameter signature wins. If not, the one-parameter signature is used.

## Cycle detection

The engine maintains a resolution stack per `resolve()` call. If a token appears on the stack when it is about to be pushed again, it throws with the full path:

```
Circular dependency detected:
  pkg:IUserRepo → pkg:IDb → pkg:IConnectionPool → pkg:IDb
```

## Disposal

Closing a scope disposes the instances it owns in **reverse construction order**. Only instances implementing the native TC39 disposal contract are disposed.

```ts
// Sync disposal
scope.dispose(): void

// Async disposal
scope.disposeAsync(): Promise<void>

// Native using / await using (TypeScript 5.2+, requires "ESNext.Disposable" in lib)
{
  await using req = root.createScope("request");
  // req.disposeAsync() called automatically on block exit
}
```

`Symbol.dispose` and `Symbol.asyncDispose` only — no custom `dispose()` interface. Sync `dispose()` throws if the scope owns a `Promise`-valued disposable, directing you to `disposeAsync()`. Async teardown is never silently skipped.

Instances owned by ancestor scopes are disposed when those scopes close, not when child scopes close.

## Async resolution

`resolve()` never lies about what it returns — it's synchronous, full stop. Two entry points, two honesty guarantees:

- **`resolve<T>(token)`** — synchronous. If satisfying `token` would require waiting on an in-flight async construction (a concurrent `resolveAsync` mid-build for the same cached instance), it throws `AsyncResolutionRequiredError` rather than block or hand back an unsettled value.
- **`resolveAsync<T>(token)`** — always returns a `Promise<T>`. It is the **only** path that can satisfy a lookup miss via the token's honest `Promise<T>` counterpart.

### Honest `Promise<T>` token-split

An async dependency is tokenized at its **true** `Promise<X>` type — never unwrapped to `X`. Register the async factory under the `Promise<X>` token directly:

```ts
services = services.addFactory('Promise<pkg:IDb>', async (sp) => {
  const pool = sp.resolve<IConnectionPool>('pkg:IConnectionPool');
  return new PostgresDb(await pool.connect());
}, [[RESOLVER_TOKEN]], 'singleton');
```

- `resolve<Promise<IDb>>("Promise<pkg:IDb>")` returns the **raw promise** — the honest, synchronous view of an async registration.
- `resolveAsync<IDb>("pkg:IDb")` finds no direct `"pkg:IDb"` registration, falls back to `"Promise<pkg:IDb>"`, and awaits it — delivering the settled `IDb`. A constructor parameter typed as the bare interface (`IDb`, not `Promise<IDb>`) hits exactly this path: it's satisfiable only in async mode, and the value the constructor actually receives is the **awaited** result, never the promise itself.

```ts
class UserRepo {
  constructor(private db: IDb) {}
  findUser(id: string) {
    return this.db.query(`SELECT * FROM users WHERE id = $1`, [id]);
  }
}

const repo = await root.resolveAsync<UserRepo>('pkg:UserRepo');
```

The container caches whatever a factory returns, verbatim — for an async factory, that's the `Promise` itself. Every resolve of the same cached token gets the same `Promise`; the factory runs exactly once. Single-flight applies across overlapping `resolveAsync` calls: the in-flight promise lands in the cache before it settles, so concurrent resolves for the same singleton share one construction instead of racing to build it twice.

`@rhombus-std/di.transformer` derives tokens just as honestly: a constructor parameter or factory return typed `Promise<IDb>` derives the token `Promise<pkg:IDb>`, at any depth, never unwrapped. See [`@rhombus-std/di.transformer`](../di.transformer/README.md#async-dependencies) for the token-derivation side.

## Factory injection

A constructor parameter whose type annotation is an inline function type returning a registered interface is injected as a **factory** — a callable that builds the target on demand — rather than a resolved instance.

```ts
// IDb is a registered class. This parameter receives a callable:
constructor(makeDb: () => IDb) { /* ... */ }

// Partial factory — the caller fills caller-supplied params:
constructor(makeRepo: (tableName: string) => IUserRepo) { /* ... */ }
```

### Named function-interface opt-out

A **named** callable interface is NOT treated as a factory — it resolves as a normal service keyed on that interface's own token:

```ts
interface IDbFactory {
  (): IDb;
}

// Resolves as the "pkg:IDbFactory" token, not a factory for IDb
constructor(dbFactory: IDbFactory) { /* ... */ }
```

Name the interface to opt out of factory interpretation whenever your function-typed service should itself be a registered dependency.

### `resolveFactory(type, params?)`

Resolve a factory callable for the token rather than an instance:

```ts
// Without params → strict zero-arg () => T; every slot must resolve from the container
const makeDb = scope.resolveFactory('pkg:IDb');
const db = makeDb(); // all deps resolved from container

// With params → factory (...params) => T; named tokens filled by caller, rest from container
const makeRepo = scope.resolveFactory('pkg:IUserRepo', ['app:tableName']);
const repo = makeRepo('users'); // tableName filled by caller; ILogger, IDb from container
```

`params` is the complete authored-order list of caller-supplied token strings, matched by token (first-occurrence, left-to-right). Passing `params` pins the factory's shape — it no longer drifts as registration state changes.

### Partial / positional factories

The injected callable exposes **only the target constructor's caller-supplied parameters**, in their relative order. Registered deps are resolved by the container at call time.

```ts
// IUserRepo concrete: constructor(log: ILogger, tableName: string, db: IDb)
// ILogger and IDb are registered; tableName is not registered (caller-supplied).
// Injected factory type: (tableName: string) => IUserRepo

class RequestHandler {
  constructor(private makeRepo: (tableName: string) => IUserRepo) {}

  handle() {
    const repo = this.makeRepo('users');
    // At call time: new UserRepo(resolve(ILogger), "users", resolve(IDb))
  }
}
```

There are no positional placeholders. The factory's call arity is exactly the count of caller-supplied parameters; the caller never sees the full constructor shape.

**Caller-supplied override is direct-slot-only, not transitive.** A caller-supplied value binds to a **direct constructor slot of the target itself** — it never reaches a dependency-of-a-dependency:

```ts
// UserRepo concrete: constructor(log: ILogger, db: IDb)
// Report concrete:   constructor(repo: IUserRepo)  — no direct ILogger slot

constructor(makeReport: (log: ILogger) => IReport) { /* ... */ }
```

If `Report`'s own constructor has no `ILogger` slot, a `log` param naming `ILogger` here has nothing to bind to — it's simply unclaimed, and `IUserRepo` (and, through it, `ILogger`) resolves normally from the container. Overriding a dependency two or more levels down the graph is deliberately not supported — plan for direct-slot overrides only.

### Lifetime semantics

The injected factory is a closure captured at injection time, referencing the owning scope. How the target's instance is managed depends on whether the factory is parameterized:

| Factory kind                                                | Lifetime behavior                                                                                                                                                                                                    |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Zero-arg** (`() => IFoo`, no caller-supplied params)      | Routes through normal `resolve` — respects the target's registered lifetime. A singleton target returns the same instance on every call; a transient target yields a fresh one.                                      |
| **Parameterized** (caller args fill caller-supplied params) | Builds a **fresh instance on every call**, bypassing the instance cache. Caller args differ per invocation, so caching would be wrong — two calls with different arguments must not collapse to one cached instance. |

The captive-dependency rule holds at call time: the target's own deps are resolved relative to the frame that owns the factory-holding instance. A factory captured by a singleton that builds a request-scoped target whose `"request"` frame is not enclosing produces a fresh transient when invoked — never a cache-captured request instance.

### `FactoryTargetError`

Thrown when the container tries to build the factory callable and cannot. Two reasons:

| Reason           | Meaning                                                                                                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"unregistered"` | The factory's target token has no registration. A factory parameter needs the target registered with `services = services.add(...)`.                                                            |
| `"not-a-class"`  | The target is registered via `addValue` or `addFactory`, not a class. A factory builds its target with `new`; only class registrations qualify. Resolve it directly or change the registration. |

`FactoryTargetError` is thrown when the factory callable is constructed (at owning-class resolution time), not when the callable is invoked.

## Union slots

A `Union` dep slot tries each member in declaration order and resolves to the first registered one. A member that is statically resolvable but throws at build time (a cycle, an unresolvable nested dependency) falls through to the next. Throws if none resolves.

```ts
import { union } from '@rhombus-std/di';

services = services.add('pkg:IHandler', Handler, [[
  union('pkg:IRedis', 'pkg:IMemoryCache'),
  'pkg:ILogger',
]]);
```

Token users construct `Union` slots with `union(...)`. Transformer users write an inline `A | B` annotation and the transformer lowers it automatically. See [`@rhombus-std/di.transformer`](../di.transformer/README.md) for the named-vs-inline distinction.

## API reference

### `ServiceManifest<Scopes>`

Zero-argument constructor — scopes are just tags, there is no root name to configure.

| Member                                                 | Signature                                                                                            | Description                                                                                                                                                 |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `add<I>(Concrete)`                                     | `(ctor: new (...) => I) => AddChain`                                                                 | Register a concrete class against interface `I`.                                                                                                            |
| `add<I>(Concrete, sig)`                                | `(ctor, sig: readonly (DepSlot \| undefined)[]) => AddChain`                                         | Register with a positional signature override.                                                                                                              |
| `.as<S>()`                                             | `(scope: S) => AddChain`                                                                             | Set the lifetime scope tag, returning the new manifest. No call → transient.                                                                                |
| `.withKey(k)`                                          | `(key: string) => AddChain`                                                                          | Make the registration keyed — its token becomes `base#key`.                                                                                                 |
| `add(token, ctor, signatures, scope?, key?)`           | `(token, ctor, signatures: DepSignatures, scope?, key?) => AddChain \| IServiceManifest`             | Class registration (lowered form). An open (holey) token routes to the open-registration table; `signatures` is required and is the sole signature channel. |
| `addFactory(token, factory, signatures, scope?, key?)` | `(token, factory: Factory, signatures: DepSignatures, scope?, key?) => AddChain \| IServiceManifest` | Factory registration. Each call param is injected by its slot, like `add`; `[[RESOLVER_TOKEN]]` hands the factory the live resolver.                        |
| `addValue(token, value, key?)`                         | `(token: string, value: unknown, key?: string) => IServiceManifest`                                  | Value registration. A pre-built instance, re-used as-is.                                                                                                    |
| `build()`                                              | `() => IServiceProvider<Scopes>`                                                                     | Seal the registration map and return a **frameless** `IServiceProvider` (no scope pre-opened). No post-build mutation is possible.                          |

### `IServiceProvider<Scopes>`

Implements `IResolver` + `IScopeFactory` + `Disposable` / `AsyncDisposable`.

| Member                          | Signature                                                      | Description                                                                                                                                                                                                                   |
| ------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolve<T>(token)`             | `(token: string) => T`                                         | Resolve an instance synchronously. A tagged registration with no enclosing open frame resolves transiently; throws on unregistered token, a cycle, or a cached in-flight async construction (`AsyncResolutionRequiredError`). |
| `resolveAsync<T>(token)`        | `(token: string) => Promise<T>`                                | Resolve asynchronously. The only path that can satisfy a lookup miss via its honest `Promise<T>` registration (see [Async resolution](#async-resolution)).                                                                    |
| `resolveFactory(type, params?)` | `(type: string, params?: readonly string[]) => (...args) => T` | Resolve a factory callable. Without `params`, strict zero-arg `() => T`; with `params`, `(...params) => T` matched by token.                                                                                                  |
| `createScope(name)`             | `(name: Scopes) => IServiceProvider<Scopes>`                   | Create a nested child scope.                                                                                                                                                                                                  |
| `dispose()`                     | `() => void`                                                   | Sync close. Throws if any owned instance has async-only disposal.                                                                                                                                                             |
| `disposeAsync()`                | `() => Promise<void>`                                          | Async close.                                                                                                                                                                                                                  |
| `[Symbol.dispose]()`            | —                                                              | Native `using` support.                                                                                                                                                                                                       |
| `[Symbol.asyncDispose]()`       | —                                                              | Native `await using` support.                                                                                                                                                                                                 |

## TypeScript configuration

Disposal support requires `"ESNext.Disposable"` in your `lib` array. `"ES2022"` alone does not include the disposal symbols.

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "ESNext.Disposable"],
  },
}
```

## How it fits

`@rhombus-std/di` is the resolution engine on top of `@rhombus-std/di.core`, which owns the abstractions and the `ServiceManifest` registration builder itself — a library author can depend on `di.core` alone to declare registrations without pulling in the resolution engine. `@rhombus-std/di` re-exports `di.core`'s authoring surface so a consumer reaches everything through one import.

- **`@rhombus-std/di.core`** — the abstractions and the registration builder this package resolves against. See [`../di.core/README.md`](../di.core/README.md).
- **`@rhombus-std/di.transformer`** — the optional compile-time plugin that lowers `add<IFoo>(Foo)` and inline `A | B` annotations into the explicit token form shown throughout this README. See [`../di.transformer/README.md`](../di.transformer/README.md).
- **`@rhombus-std/di.transformer.options`** — a `di.transformer` satellite that lowers `addOptions<T>()` sugar.
- **`@rhombus-std/options`** and **`@rhombus-std/options.augmentations`** — build an `IOptions<T>` accessor and configuration-binding pipeline on top of a `ServiceManifest`.
- **`@rhombus-std/hosting`** — composes `di` with configuration and logging into a full application host.

## Notes

- No decorators, no `reflect-metadata`, no runtime type introspection. The container works purely on string tokens and the positional `DepRecord` signatures carried on each registration.
- The internal scope frame (instance cache + disposal + parent link) is not exported — consumers see only the `IServiceProvider` interface a scope backs, never the frame implementation.
- `sideEffects: true` in `package.json` matters: importing `@rhombus-std/di` runs a load-time side effect that attaches `build()`'s engine-constructing half onto `ServiceManifest`. Import the package normally and this happens automatically — no separate side-effect import is needed for the base runtime (only the optional transformer and providers in other families use that pattern).
