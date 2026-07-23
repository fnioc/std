# `@rhombus-std/di`

`di.core` (the abstractions and the concrete `ServiceManifest` registration builder, registration-time
errors, `ActivatorUtilities`, the `EmptyServiceProvider` null-object singleton) ← `di` (the resolution
engine: scopes, resolution, captive-dependency protection, `ServiceProviderOptions`-gated
`validateScopes`/`validateOnBuild`, and aggregated disposal). `di.transformer` (token derivation,
dependency extraction, registration lowering, factory-signature diagnostic) depends on `di.core`
types only, never the `di` runtime. `di.transformer.options` is a satellite lowering the
`addOptions<T>()` sugar.

## Justified divergences

`@rhombus-std/di` mirrors the reference container's registration and resolution model faithfully,
then goes further in several directions the reference container has no equivalent for. Each entry
below assumes you already know constructor injection and the reference container's three
lifetimes; it only covers what's new. Snippets assume an ambient `services` (a `ServiceManifest`
being built, the `IServiceCollection` analog) and a `resolver`/`provider` obtained from
`services.build()` (the `IServiceProvider` analog). `ServiceManifest` is IMMUTABLE — every
registration verb and chain modifier returns a NEW manifest, so every snippet below reassigns
`services = services.addClass(...)` rather than calling it as a bare statement (see divergence 11).

### 1. Open-ended named scopes

The reference container has exactly three lifetimes — singleton, scoped, transient — and one
anonymous non-singleton scope you open with `CreateScope()`. Here, `.as(...)` accepts _any_ string
you declare on `ServiceManifest<S>`, `createScope(name)` opens a frame under that name, and frames
nest to any depth in any order you choose. Transient isn't a named value at all — it's simply the
absence of `.as(...)`. A tag whose frame is never opened anywhere still resolves; it just does so
transiently instead of throwing.

```ts
let services = new ServiceManifest<'singleton' | 'request' | 'transaction'>();

services = services.addClass<ILogger>(ConsoleLogger).as<'singleton'>();
services = services.addClass<IRepo>(SqlRepo).as<'request'>();
services = services.addClass<IUnitOfWork>(UnitOfWork).as<'transaction'>(); // nests deeper than "request"
services = services.addClass<IAuditor>(Auditor); // no .as() at all — transient, never cached

const app = services.build().createScope('singleton');
const req = app.createScope('request');
const tx = req.createScope('transaction'); // any depth, any name you declared
```

If nothing ever calls `createScope("transaction")`, `IUnitOfWork` still resolves — just as a fresh
instance every time, never a throw and never an auto-created frame.

### 2. Async resolution

The reference container has no async resolution path — a built container is synchronous end to
end. `resolveAsync<T>()` is the one path allowed to satisfy `T` via an honest `Promise<T>`
registration, so an async-built dependency (a remote config fetch, a warmed connection pool)
composes like anything else. Plain `resolve()` never awaits anything — asking it for the
`Promise<T>` type itself hands back the raw, un-awaited promise as a value. Disposal gets the
matching split.

```ts
services = services.addFactory<Promise<IBanner>>(fetchBanner).as<'singleton'>();

const banner = await resolver.resolveAsync<IBanner>(); // awaits the Promise<T> registration
const pending = resolver.resolve<Promise<IBanner>>(); // same registration, un-awaited

await using scope = provider.createScope('request'); // disposeAsync() awaits owned pendings
```

### 3. Collection resolution

The reference container has one collection shape, `GetServices<T>`. Here, two independent wrapper
tokens resolve over the same aggregate — `T[]` / `Array<T>` and a lazy, re-iterable `Iterable<T>`
— both walking every registration of `T` in registration order, each element honoring its own
registration's lifetime. An unregistered element type aggregates to an empty collection; the bare
element token still throws.

```ts
services = services.addClass<IGreeting>(FormalGreeting).as<'singleton'>();
services = services.addClass<IGreeting>(CasualGreeting).as<'singleton'>();

resolver.resolve<IGreeting[]>(); // [formal, casual] — registration order
resolver.resolve<Iterable<IGreeting>>(); // distinct wrapper, re-iterable, same elements

resolver.resolve<IPlugin[]>(); // no IPlugin registered anywhere → [], never throws
resolver.resolve<IPlugin>(); // same case, bare token → throws UnregisteredTokenError
```

### 4. Union slots

The reference container has no equivalent — one constructor parameter means one registration.
Here, a parameter typed as a TS union injects the first alternative that resolves, trying each
left to right and falling through past both unregistered members and members that throw while
building; exhausting every member throws.

```ts
class CacheConsumer {
  constructor(private readonly cache: IRedisCache | IMemoryCache) {}
}
services = services.addClass<IRedisCache>(RedisCache).as<'singleton'>();
services = services.addClass<CacheConsumer>(CacheConsumer).as<'singleton'>();
// IMemoryCache is never registered — falls through to RedisCache, no error

// manual dialect — the same signature, hand-written:
services = services.addClass('pkg:CacheConsumer', CacheConsumer, [[
  union('pkg:IRedisCache', 'pkg:IMemoryCache'),
]]);
```

### 5. Literal-value slots

The reference container has no equivalent — every parameter either resolves from the container or
comes from a factory closure. Here, a parameter typed as a literal (`"prod"`, `42`, `true`) is
injected with that exact value directly, no registration involved, and is always satisfiable. This
is also what powers optional parameters: `dep?: IFoo` lowers to `union(IFoo, { value: undefined })`,
so a genuinely absent dependency needs no `!` casts.

```ts
class Environment {
  constructor(public readonly stage: 'prod') {}
}
services = services.addClass<Environment>(Environment).as<'singleton'>();
// "prod" is supplied directly — no token for it exists anywhere
```

### 6. Type-argument injection (`Typeof<T>` / `typeArg`)

The reference container resolves an open generic's type argument via runtime reflection over the
closed `Type`. Here, a `Typeof<T>` phantom-typed parameter gets the _token string_ of the bound
type argument injected directly — no reflection at all. The manual counterpart names the hole
positionally with `{ typeArg: n }`.

```ts
class Repository<T> {
  constructor(public readonly entityToken: Typeof<T>) {}
}
services = services.addClass<IRepository<$<1>>>(Repository<$<1>>).as<
  'request'
>();

// closing IRepository<User> builds a Repository whose entityToken is the
// literal string "pkg:User" — no reflection, no MakeGenericType
resolver.resolve<IRepository<User>>().entityToken; // "pkg:User"

// manual dialect:
services = services.addClass('pkg:IRepository<$1>', Repository, [[{
  typeArg: 1,
}]]).as(
  'request',
);
```

### 7. Factory resolution with caller-supplied params

The reference container's `ActivatorUtilities` builds a factory via reflection over a
constructor's parameter types. Here, a `(...params) => T` factory is derived from a typed
parameter (the transformer partitions the target's own constructor against the factory's declared
parameters) or from `resolveFactory(token, params?)` directly — no reflection anywhere, and a
param the caller claims always wins over a container registration for that same token.

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
services = services.addClass<ILogger>(ConsoleLogger).as<'singleton'>();
services = services.addClass<Report>(Report).as<'singleton'>();
services = services.addClass<Printer>(Printer).as<'singleton'>();
// makeReport("acme") resolves `log` from the container, threads "acme" straight
// through to the ctor

// equivalent, called directly off a resolver (either dialect):
const makeReport = resolver.resolve<(customer: string) => Report>();
// manual: resolver.resolveFactory("pkg:Report", ["string"])
```

### 8. Structural captive-dependency safety

The reference container needs an opt-in `ValidateScopes` flag that _throws_ at resolve time when a
longer-lived service captures a shorter-lived one — and only if you remembered to turn it on. Here
there is no flag and no throw path for this bug class: a dependency always resolves relative to
the frame that _owns_ the requesting registration, so a singleton's request-scoped dependency can
never become the request's cached instance. The worst case is a fresh transient, never a captured
instance.

```ts
class RequestContext {
  readonly id = Math.random();
}
class Cache {
  constructor(private readonly ctx: RequestContext) {}
}
services = services.addClass<RequestContext>(RequestContext).as<'request'>();
services = services.addClass<Cache>(Cache).as<'singleton'>(); // a captive dependency, by the reference's definition

const req = app.createScope('request');
const cache = req.resolve<Cache>();
// Cache is singleton-owned, so its ctx resolves relative to the singleton frame
// (no enclosing "request" there) — a fresh RequestContext, never req's cached one.
// No flag to opt into, no throw: the bug shape is structurally excluded.
```

### 9. Compile-time authoring (no-transformer-first + transformer)

The reference container relies on runtime reflection unconditionally — there is no way to
hand-author its metadata yourself. Every capability above is fully usable by hand here, with zero
build step: you write the token strings and dep signatures directly. The transformer is strictly
boilerplate deletion — it lowers `add<I>(Ctor)` into exactly the explicit-token call a
plugin-less author would have written, never adding a capability.

```ts
// tokenless — the transformer expands this at build time
services = services.addClass<ILogger>(ConsoleLogger).as<'singleton'>();

// exactly what it lowers to, and what a plugin-less author writes by hand
services = services.addClass('pkg:ILogger', ConsoleLogger, [[]]).as(
  'singleton',
);
```

Every feature above has this same relationship: `union(...)`, `{ value }`, `{ typeArg }`, and
`resolveFactory(...)` are all public, hand-writable data — not compiler output you're locked out
of authoring yourself.

### 10. Keyed registrations

The reference container needs a whole second hierarchy — `IKeyedServiceProvider`,
`KeyedService.AnyKey`, `FromKeyedServicesAttribute` — because its service identity is a `Type`
object with no room for a key. Here, identity is already a token _string_, so a key is just a
suffix on it: `"pkg:IStore#k"`. `resolve` takes an optional trailing argument — an exact string
for one service (`''` is the non-keyed registration), a `RegExp` for every matching registration
as a list, in registration order. There's no `AnyKey` sentinel to special-case: `/.+/` means "has
some key" and `/.*/` means "keyed or not", a distinction the reference can't express at all. `T[]`
/ `Iterable<T>` stay non-keyed-only, so the two aggregate forms never overlap.

```ts
services = services.addClass<IStore>(RedisStore).as<'singleton'>(); // key '' — the plain registration
services = services.addClass<Keyed<IStore, 'sql'>>(SqlStore).as<'singleton'>();
services = services.addClass<Keyed<IStore, 'mem'>>(MemStore).as<'singleton'>();

resolver.resolve<IStore>(); // RedisStore — the unkeyed one
resolver.resolve<IStore>('sql'); // SqlStore — exact key
resolver.resolve<IStore>(/^(sql|mem)$/); // [SqlStore, MemStore] — RegExp → list
resolver.resolve<IStore>(/.+/); // every keyed registration, RedisStore excluded
resolver.resolve<IStore>(/.*/); // every registration, RedisStore included too

class Report {
  constructor(private readonly store: Keyed<IStore, 'sql'>) {}
}
// Keyed stacks with Inject — the base comes from Inject, the key from Keyed:
class Audit {
  constructor(
    private readonly store: Keyed<Inject<IStore, 'pkg:IStore'>, 'sql'>,
  ) {}
}

// manual dialect — what Keyed<IStore, 'sql'> lowers to:
resolver.resolve('pkg:IStore#sql');
```

### 11. Immutable registration + gated fluent signature builder

The reference container's `IServiceCollection` is a mutable `List<ServiceDescriptor>` — every
`services.AddSingleton<T>()` call appends in place and hands back the SAME reference, so chaining is
just repeated mutation of one object. Here, `ServiceManifest` is an immutable, iterable decorator
chain: every registration verb (`addClass` / `addFactory` / `addValue`) and every chain modifier
(`.as` / `.withKey` / `.withSignature` / `.withSignatures`) returns a NEW manifest wrapping the one
it was called on, and the receiver itself is untouched. A call whose result is discarded registers
nothing — there is no implicit "current collection" to have mutated.

```ts
let services = new ServiceManifest();
services = services.addClass<ILogger>(ConsoleLogger); // ← must be kept
services.addClass<IClock>(SystemClock); // ← LOST: result discarded, SystemClock never registered
```

The plugin-less, no-sugar `addClass(token, ctor)` / `addFactory(token, factory)` forms go one step
further: dependency signatures are mandatory, and the bare 2-arg call **withholds the manifest
face** — `build` / `addClass` / `seal` are compile-time absent from what it returns — until
`.withSignature(...)` or `.withSignatures(...)` supplies one. `.as(...)` / `.withKey(...)` may still
be applied first; they refine the pending registration without opening the gate. Passing a signature
positionally (the 3+-arg overloads) starts the chain already ungated.

```ts
const pending = services.addClass('pkg:IRepo', SqlRepo); // gated — no signature yet
pending.build(); // compile error: `build` isn't on `pending`'s type until a signature arrives

services = pending.withSignature('pkg:IConnection').as('singleton'); // opens the gate

// withSignature APPENDS and is repeatable — each call adds one more injectable overload:
services = services.addClass('pkg:ICache', RedisOrMemCache)
  .withSignature('pkg:IRedisClient')
  .withSignature('pkg:IMemoryStore');

// withSignatures REPLACES the whole signature set in bulk, once — it cannot follow
// a withSignature append, and (like withSignature) it opens the gate:
services = services.addClass('pkg:ICache', RedisOrMemCache)
  .withSignatures(['pkg:IRedisClient'], ['pkg:IMemoryStore']);
```

Under the transformer's type-driven sugar (`addClass<I>(C)`), the signature is derived from the
constructor automatically, so the chain is never gated — `withSignature<T>()`/`withSignatures<T>()`
there are OVERRIDES of the derived signature, not gate-openers:

```ts
services = services.addClass<ICache>(RedisCache).as<'singleton'>(); // manifest present immediately
services = services.addClass<ICache>(RedisCache).withSignature<
  [IRedisClient]
>(); // overrides the derived signature
```

---

One more cross-cutting difference: every failure mode here is a typed subclass of `DiError`
(`UnregisteredTokenError`, `NoSatisfiableSignatureError`, `CircularDependencyError`,
`AsyncDisposalRequiredError`, `ScopeValidationError`, `RegistrationValidationError`, …), so callers
branch on `instanceof` instead of parsing an exception message.

## Design notes

Background from the pre-consolidation design process (originally a standalone `fnioc/ioc` repo's
PRD). Verified against current `libraries/di*/src` where noted; treat anything not explicitly
verified as directional, not literal — exact class/package names have moved on since
consolidation (there is no `DiBuilder` or `@fnioc/*` scope anymore; see the family map above for
current names).

### The lowering mental model

The organizing idea, still accurate: the relationship between authoring and the emitted runtime
calls mirrors JSX and `createElement`. You author against rich, fully type-checked, interface-based
registrations; the compile-time transformer lowers that into plain runtime calls carrying explicit
string tokens and positional dep arrays the engine consumes without ever touching a TS type. A
library author compiles once and publishes the lowered output — every consumer, transformer
configured or not, installs the library and its registrations just run.

### Scopes are uniform tags, not a fixed lifetime enum — confirmed current

**Verified word-for-word against `libraries/di/src/ServiceProviderClass.ts`'s own comments.**
`"singleton"` is not special — it's a tag you happen to open once at the top. `build()` returns a
frameless provider: no root scope is pre-opened, no instance cache at the provider level. A tagged
registration resolved when no enclosing frame carries that tag yields a fresh transient — no cache,
no error, exactly like an untagged registration. Caching works only when the matching frame is
actually open. This is the mechanism behind divergence #1 (open-ended named scopes) and #8
(structural captive-dependency safety) above — both are consequences of this one rule, not separate
design decisions.

### Explicitly rejected — do not reintroduce

Confirmed still absent from the current source (`reflect-metadata` and `experimentalDecorators` do
not appear anywhere in `libraries/di*`):

- **Legacy/experimental decorators, `reflect-metadata`, `Symbol.metadata`-as-store** — all rejected
  in favor of the transformer supplying precise data at build time. Reflection-based metadata is
  interface-blind (an interface erases to `Object` under runtime reflection) and requires a global
  side-effecting polyfill this design has no other need for.
- **Writing dep data onto the class itself** (`static $inject`, a symbol static) — reintroduces
  prototype-inheritance bleed (a subclass silently inherits its parent's dep array) and pollutes
  the class surface. The dep store lives off to the side instead (currently a per-token record, not
  the original PRD's exact `Symbol.for` global-map mechanism — verify the storage mechanism itself
  against current source before relying on that specific detail).
- **A separate async resolution channel / `resolveAsync()`-only design** — async is expressed as
  `Promise<T>` values through the one sync channel; confirmed current (divergence #2 above).
  Rejected: a container that awaits internally, hiding asynchrony behind a covert await.
  `resolveAsync<T>()` as it exists today unwraps the honest `Promise<T>` registration — not a
  second resolution channel in the rejected sense.
- **A separate ABI package** — the ABI types and the token/registration machinery that reads and
  writes them are one intrinsic unit; splitting them buys no decoupling. (Package boundaries have
  since evolved into `di.core`/`di`/`di.transformer`/`di.transformer.options` — a different split
  than the PRD's original three-package `core`/`di`/`transformer`, but the "no separate ABI
  package" reasoning still applies to why there's no fifth `di.abi` package today.)

### Not verified in this pass — treat as historical only

The PRD's exact token-derivation grammar (package-public vs. app-internal path rules, nested-type
qualification, the `<source>:<exportName>` format) plausibly still holds in spirit — the same
concept names (`tokenfor`, app-internal fallback) exist in `libraries/primitives.transformer/src` —
but wasn't diffed rule-by-rule against the current implementation here. Same caveat for the exact
factory-signature diagnostic rules and the full token-derivation edge-case table. Verify against
`libraries/primitives.transformer/src` before citing exact behavior.
