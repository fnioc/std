# `@rhombus-std/di` — features beyond the reference container

`@rhombus-std/di` mirrors the reference container's registration and resolution model
faithfully, then goes further in several directions the reference container has no
equivalent for. Each entry below assumes you already know constructor injection and the
reference container's three lifetimes; it only covers what's new. Snippets assume an
ambient `services` (a `ServiceManifest` being built, the `IServiceCollection` analog) and
a `resolver` / `provider` obtained from `services.build()` (the `IServiceProvider` analog).

## 1. Open-ended named scopes

The reference container has exactly three lifetimes — singleton, scoped, transient — and
one anonymous non-singleton scope you open with `CreateScope()`. Here, `.as(...)` accepts
_any_ string you declare on `ServiceManifest<S>`, `createScope(name)` opens a frame under
that name, and frames nest to any depth in any order you choose. Transient isn't a named
value at all — it's simply the absence of `.as(...)`. A tag whose frame is never opened
anywhere still resolves; it just does so transiently instead of throwing.

```ts
const services = new ServiceManifest<'singleton' | 'request' | 'transaction'>();

services.add<ILogger>(ConsoleLogger).as<'singleton'>();
services.add<IRepo>(SqlRepo).as<'request'>();
services.add<IUnitOfWork>(UnitOfWork).as<'transaction'>(); // nests deeper than "request"
services.add<IAuditor>(Auditor); // no .as() at all — transient, never cached

const app = services.build().createScope('singleton');
const req = app.createScope('request');
const tx = req.createScope('transaction'); // any depth, any name you declared
```

If nothing ever calls `createScope("transaction")`, `IUnitOfWork` still resolves — just as
a fresh instance every time, never a throw and never an auto-created frame.

## 2. Async resolution

The reference container has no async resolution path — a built container is synchronous
end to end. `resolveAsync<T>()` is the one path allowed to satisfy `T` via an honest
`Promise<T>` registration, so an async-built dependency (a remote config fetch, a warmed
connection pool) composes like anything else. Plain `resolve()` never awaits anything —
asking it for the `Promise<T>` type itself hands back the raw, un-awaited promise as a
value. Disposal gets the matching split.

```ts
services.addFactory<Promise<IBanner>>(fetchBanner).as<'singleton'>();

const banner = await resolver.resolveAsync<IBanner>(); // awaits the Promise<T> registration
const pending = resolver.resolve<Promise<IBanner>>(); // same registration, un-awaited

await using scope = provider.createScope('request'); // disposeAsync() awaits owned pendings
```

## 3. Collection resolution

The reference container has one collection shape, `GetServices<T>`. Here, two independent
wrapper tokens resolve over the same aggregate — `T[]` / `Array<T>` and a lazy, re-iterable
`Iterable<T>` — both walking every registration of `T` in registration order, each element
honoring its own registration's lifetime. An unregistered element type aggregates to an
empty collection; the bare element token still throws.

```ts
services.add<IGreeting>(FormalGreeting).as<'singleton'>();
services.add<IGreeting>(CasualGreeting).as<'singleton'>();

resolver.resolve<IGreeting[]>(); // [formal, casual] — registration order
resolver.resolve<Iterable<IGreeting>>(); // distinct wrapper, re-iterable, same elements

resolver.resolve<IPlugin[]>(); // no IPlugin registered anywhere → [], never throws
resolver.resolve<IPlugin>(); // same case, bare token → throws UnregisteredTokenError
```

## 4. Union slots

The reference container has no equivalent — one constructor parameter means one
registration. Here, a parameter typed as a TS union injects the first alternative that
resolves, trying each left to right and falling through past both unregistered members and
members that throw while building; exhausting every member throws.

```ts
class CacheConsumer {
  constructor(private readonly cache: IRedisCache | IMemoryCache) {}
}
services.add<IRedisCache>(RedisCache).as<'singleton'>();
services.add<CacheConsumer>(CacheConsumer).as<'singleton'>();
// IMemoryCache is never registered — falls through to RedisCache, no error

// manual dialect — the same signature, hand-written:
services.add('pkg:CacheConsumer', CacheConsumer, [[
  union('pkg:IRedisCache', 'pkg:IMemoryCache'),
]]);
```

## 5. Literal-value slots

The reference container has no equivalent — every parameter either resolves from the
container or comes from a factory closure. Here, a parameter typed as a literal (`"prod"`,
`42`, `true`) is injected with that exact value directly, no registration involved, and is
always satisfiable. This is also what powers optional parameters: `dep?: IFoo` lowers to
`union(IFoo, { value: undefined })`, so a genuinely absent dependency needs no `!` casts.

```ts
class Environment {
  constructor(public readonly stage: 'prod') {}
}
services.add<Environment>(Environment).as<'singleton'>();
// "prod" is supplied directly — no token for it exists anywhere
```

## 6. Type-argument injection (`Typeof<T>` / `typeArg`)

The reference container resolves an open generic's type argument via runtime reflection
over the closed `Type`. Here, a `Typeof<T>` phantom-typed parameter gets the _token
string_ of the bound type argument injected directly — no reflection at all. The manual
counterpart names the hole positionally with `{ typeArg: n }`.

```ts
class Repository<T> {
  constructor(public readonly entityToken: Typeof<T>) {}
}
services.add<IRepository<$<1>>>(Repository<$<1>>).as<'request'>();

// closing IRepository<User> builds a Repository whose entityToken is the
// literal string "pkg:User" — no reflection, no MakeGenericType
resolver.resolve<IRepository<User>>().entityToken; // "pkg:User"

// manual dialect:
services.add('pkg:IRepository<$1>', Repository, [[{ typeArg: 1 }]]).as(
  'request',
);
```

## 7. Factory resolution with caller-supplied params

The reference container's `ActivatorUtilities` builds a factory via reflection over a
constructor's parameter types. Here, a `(...params) => T` factory is derived from a typed
parameter (the transformer partitions the target's own constructor against the factory's
declared parameters) or from `resolveFactory(token, params?)` directly — no reflection
anywhere, and a param the caller claims always wins over a container registration for
that same token.

```ts
class Report {
  constructor(
    private readonly log: ILogger, // container-resolved
    public readonly customer: string, // caller-supplied
  ) {}
}
class Printer {
  constructor(private readonly makeReport: (customer: string) => Report) {}
}
services.add<ILogger>(ConsoleLogger).as<'singleton'>();
services.add<Report>(Report).as<'singleton'>();
services.add<Printer>(Printer).as<'singleton'>();
// makeReport("acme") resolves `log` from the container, threads "acme" straight
// through to the ctor

// equivalent, called directly off a resolver (either dialect):
const makeReport = resolver.resolve<(customer: string) => Report>();
// manual: resolver.resolveFactory("pkg:Report", ["string"])
```

## 8. Structural captive-dependency safety

The reference container needs an opt-in `ValidateScopes` flag that _throws_ at resolve
time when a longer-lived service captures a shorter-lived one — and only if you remembered
to turn it on. Here there is no flag and no throw path for this bug class: a dependency
always resolves relative to the frame that _owns_ the requesting registration, so a
singleton's request-scoped dependency can never become the request's cached instance. The
worst case is a fresh transient, never a captured instance.

```ts
class RequestContext {
  readonly id = Math.random();
}
class Cache {
  constructor(private readonly ctx: RequestContext) {}
}
services.add<RequestContext>(RequestContext).as<'request'>();
services.add<Cache>(Cache).as<'singleton'>(); // a captive dependency, by the reference's definition

const req = app.createScope('request');
const cache = req.resolve<Cache>();
// Cache is singleton-owned, so its ctx resolves relative to the singleton frame
// (no enclosing "request" there) — a fresh RequestContext, never req's cached one.
// No flag to opt into, no throw: the bug shape is structurally excluded.
```

## 9. Compile-time authoring (no-transformer-first + transformer)

The reference container relies on runtime reflection unconditionally — there is no way to
hand-author its metadata yourself. Every capability above is fully usable by hand here,
with zero build step: you write the token strings and dep signatures directly. The
transformer is strictly boilerplate deletion — it lowers `add<I>(Ctor)` into exactly the
explicit-token call a plugin-less author would have written, never adding a capability.

```ts
// tokenless — the transformer expands this at build time
services.add<ILogger>(ConsoleLogger).as<'singleton'>();

// exactly what it lowers to, and what a plugin-less author writes by hand
services.add('pkg:ILogger', ConsoleLogger, [[]]).as('singleton');
```

Every feature above has this same relationship: `union(...)`, `{ value }`, `{ typeArg }`,
and `resolveFactory(...)` are all public, hand-writable data — not compiler output you're
locked out of authoring yourself.

---

One more cross-cutting difference: every failure mode here is a typed subclass of
`DiError` (`UnregisteredTokenError`, `NoSatisfiableSignatureError`,
`CircularDependencyError`, `AsyncResolutionRequiredError`, …), so callers branch on
`instanceof` instead of parsing an exception message.
