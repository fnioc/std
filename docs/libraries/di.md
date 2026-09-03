# `@rhombus-std/di`

A container whose addresses are your types. `add<IClock>(SystemClock)` registers against the
interface itself — no string keys, no tokens to keep in sync, no decorators, no reflection polyfill —
because a `Type` is an interned node and `typefor<IClock>()` is resolved at compile time. Constructors
are plain TypeScript: a union parameter takes the first alternative that resolves, an optional one
falls back to `undefined`, an object-shaped one is built from its properties, a `(customer: string)
=> Report` one becomes a factory that threads the caller's argument through. Async is one call —
`resolveAsync` hoists every await in the graph onto one boundary and settles them in parallel. And
there is one door: `Builder` opens a chain, every addon rides the same composable middleware pipeline
the engine sits inside, and `build()` seals it. The manifest is immutable, so a registration you
forgot to keep is a compile-visible bug rather than a silent one, and every failure is a typed error
you branch on with `instanceof`.

`di.core` (the abstractions: the immutable `Manifest` and its `Registration`s, the `describe`
chain, `Addon` / `Middleware`, the `Request` classes, `IServiceProvider`, the whole error taxonomy,
and the `ControlService` control surface) ← `di` (the engine: `Builder`, the plan-and-realize resolution core, the
`ServiceProvider` every container is minted with, and the validation addons; it re-exports the
taxonomy so both imports name the same classes). A library references `di.core`; only an entry point
references `di`. `di.extras` (the type-argument sugar — `add<T>()`, `describe<T>()`,
`resolve<T>()` — and the implementer-observing `asClass(ctor)` / `asFactory(fn)` doors) depends on
`di.core` types only, never the `di` runtime. `di.extras.options` is a satellite carrying the
`addOptions<T>()` sugar.

Every snippet below assumes an ambient `services` (a `Manifest` being composed) and a `provider`
obtained from a `Builder`'s `build()`. `Manifest` is IMMUTABLE — every verb returns a NEW manifest,
so every snippet reassigns `services = services.add(...)` rather than calling it as a bare statement
(see section 2).

### 1. One door: the builder and the chain

Everything a container is made of arrives through one surface, and the type system checks that the
pieces agree. `Builder.withServices(fn)` installs the registrations `fn` composes onto an empty
manifest, `Builder.useAddon(addon)` installs an addon, and either may open the chain. Every input
threads one lifetime vocabulary — `unknown` until the first input carrying one locks it on, and
fixed for the chain from there, so an addon speaking a different vocabulary is refused where it is
written. `build()` seals the chain into an `IServiceProvider`.

```ts
const provider = Builder
  .withServices((services: Manifest<'app' | 'request'>) =>
    services
      .add<IClock>(SystemClock, 'app')
      .add<IRepo>(SqlRepo, 'request')
  )
  .useAddon(lifetimeModel) // an Addon<'app' | 'request'>; any other vocabulary is refused here
  .build();

const clock = provider.resolve<IClock>();
```

An addon is two things: the registrations it files, and the middleware it composes into the
container's one chain. Registrations are an addon like any other — `withServices` is an addon
contributing no middleware of its own — so a library ships its whole contribution as one value.

```ts
const addon: Addon<unknown> = {
  registrations: [Registration.value(typefor<IClock>(), new SystemClock())],
  middleware: next => next,
};
```

### 2. The manifest is immutable

No registration order bugs and no action at a distance. `Manifest` is an iterable chain of
registrations, newest first. Every registration verb — `add`, `tryAdd`, `replace`, `remove`,
`removeAll`, `addValue` and their kin — returns a NEW manifest wrapping the one it was called on,
and the receiver itself is untouched. A call whose result is discarded registers nothing. A verb that
changes nothing returns the receiver itself, so `===` answers "did this change anything".

```ts
let services = Manifest.empty();
services = services.add<IClock>(SystemClock); // ← must be kept
services.add<IRepo>(SqlRepo); // ← LOST: result discarded, SqlRepo never registered

services = services.tryAdd<IClock>(WallClock); // IClock already has a registration: the receiver, unchanged
services = services.replace<IClock>(WallClock); // swaps the first IClock registration, everything else untouched
services = services.removeAll<IClock>(); // every IClock registration gone
```

Manifests compose. `add` also takes a whole manifest, merged as one batch in its own order, or any
iterable of registrations, filed one after another — so a feature's registrations are a value you
build once and hand around.

```ts
services = services.add(Manifest.build(m => m.add<IClock>(SystemClock)));
```

### 3. Registrations are data, and `describe` builds one

A registration is a plain object you can inspect, compare and construct yourself: an `address` (a
`Type`) and one implementer — a `ctor` the engine `new`s, a `factory` it calls, or a `value` it
hands back as it stands. The member naming the implementer says which door it came in by, because
the implementer's own type cannot: a function registered as a value is handed back, the same
function registered as a factory is called. A constructor or factory carries its own type beside it —
`ctorType` / `factoryType` — which is where its signatures live, so the engine reads what a
constructor takes from the same place the constructor is.

```ts
Registration.ctor(typefor<IClock>(), SystemClock, typefor(SystemClock));
Registration.factory(typefor<IClock>(), makeClock, typefor(makeClock));
Registration.value(typefor<IClock>(), new SystemClock());
```

`describe` opens a chain that builds one, and the type system tracks which steps remain: choose the
implementer through an `as*` door, refined by `withLifetime` and `taggedAs`. Each step hands back a
new node and spends its own slot, so none can be taken twice; once a door is taken the node IS a
`Registration` — hand it to the registration-taking verbs, hold it in a variable, or build several in
a helper and register them together.

```ts
const clock = services.describe<IClock>().taggedAs('wall').asClass(WallClock).withLifetime('app');
services = services.add(clock);
```

`asValue` takes no lifetime: a value IS its instance, so there is no construction for a lifetime to
govern. A value registration also refuses an open address — one value cannot stand for every
closing of a generic hole — unless the address is a callable, which honestly is every closing.

`add` refuses a callable through its value shape, since the callable's own type cannot say it is
data; `addValue` is the door that forces one down the value path.

```ts
services = services.add<IClock>(new SystemClock()); // value shape: handed back as it stands
services = services.addValue<() => Date>(() => new Date()); // a function meant as a value
```

### 4. Lifetime is a vocabulary you choose

The container does not dictate your lifetimes; it carries them. A registration holds a `lifetime`
from the chain's vocabulary — the `Lifetime` type argument on `Manifest<Lifetime>` and
`Builder<Lifetime>`. A vocabulary that admits `undefined` lets the argument be omitted; one that does
not makes every constructed registration name a value, and the `describe` chain withholds
registration-ness until `withLifetime` is taken, so a missing lifetime is a compile error rather than
a runtime surprise. What a value MEANS — how long the construction is kept, and where — is the
lifetime model's own concern, installed as an addon that reads each registration's `lifetime` at
runtime. The engine promises only which node a construction happens at.

```ts
// vocabulary admits omission: the lifetime argument is optional
let loose = Manifest.empty<'app' | undefined>().add<IClock>(SystemClock);
// vocabulary does not: every constructed registration names one
let strict = Manifest.empty<'app'>().add<IClock>(SystemClock, 'app');
```

An engine-synthesized construction — an object built from its properties, a tuple, a latebound
call, an invoker — has no registration and no lifetime datum behind it, so it lives outside any
model's jurisdiction and realizes afresh on every call.

### 5. Async resolution

An async-built dependency composes like any other, and the container does the awaiting where a
constructor cannot. `resolveAsync<T>()` asks for `Promise<T>` and settles everything beneath that
only a promise registration can answer, in one wait, in parallel. Plain `resolve()` never awaits
anything — asking it for the `Promise<T>` type itself hands back a promise as a value. Full
mechanics: `docs/features/async-resolution.md`.

```ts
services = services.add<Promise<IBanner>>(fetchBanner);

const banner = await provider.resolveAsync<IBanner>(); // awaits the Promise<T> registration
const pending = provider.resolve<Promise<IBanner>>(); // same registration, un-awaited
```

### 6. Collection resolution

Ask for the collection shape you mean and get exactly its semantics. Three wrapper addresses
resolve over the same aggregate — `T[]`, `Iterable<T>` and `AsyncIterable<T>` — each walking every
registration of `T` in registration order, with the element's own synthesis (if `T` has one) as the
tail. `T[]` is a snapshot, every element realized eagerly; `Iterable<T>` is a live query, each
iteration step realizing one element, re-iterable; `AsyncIterable<T>` settles one element per step.
An unregistered element type aggregates to an empty collection; the bare element address still
throws. `resolveMany<T>()` is `Iterable<T>` by name.

```ts
services = services.add<IGreeting>(FormalGreeting).add<IGreeting>(CasualGreeting);

provider.resolve<IGreeting[]>(); // [formal, casual] — registration order
provider.resolveMany<IGreeting>(); // Iterable<IGreeting>: lazy, re-iterable, same elements

provider.resolve<IPlugin[]>(); // no IPlugin registered anywhere → [], never throws
provider.resolve<IPlugin>(); // same case, bare address → throws UnsatisfiableError
```

### 7. Unions and optional dependencies, written as TypeScript

A constructor parameter typed `IRedisCache | IMemoryCache` means what it says. Every ask is
answered the same way: the registrations matching the whole address, newest first, and only on a
miss the address kind's own synthesis. A union is one such kind — satisfied by a registration of the
union itself if one exists, and otherwise by the first member that resolves, in the union's
canonical member order, falling through past a member nothing produces and past one whose graph has
a hole. Exhausting every member throws.

```ts
class CacheConsumer {
  constructor(private readonly cache: IRedisCache | IMemoryCache) {}
}
services = services.add<IRedisCache>(RedisCache).add<CacheConsumer>(CacheConsumer);
// IMemoryCache is never registered — CacheConsumer gets the RedisCache, no error

// the same signature, explicit:
services = services.add(
  typefor<CacheConsumer>(),
  CacheConsumer,
  Type.ctor(typefor<CacheConsumer>(), [[Type.union(typefor<IRedisCache>(), typefor<IMemoryCache>())]]),
);
```

Optional parameters need no special case and no `!` casts. Canonical order puts literals last, so
`dep?: IFoo` — which is `IFoo | undefined` — serves the `undefined` literal only once `IFoo` itself
has no way to build. A caller for whom absence is an answer spells that in the address it asks for.

```ts
provider.resolve(Type.union(typefor<IFoo>(), typefor<undefined>())); // IFoo, or undefined — never a throw
```

### 8. Synthesis on a miss: literals, objects, tuples

Shapes you did not register are built for you. A literal address is its own value, injected
directly with no registration involved. An object type with no registration of its own is built from
its properties — all of them or none, so one unresolvable property leaves the whole object
unsatisfiable rather than half-built. A tuple is built the same way, member by member.

```ts
class Environment {
  constructor(public readonly stage: 'prod') {}
}
services = services.add<Environment>(Environment); // 'prod' is supplied directly

provider.resolve<{ clock: IClock; repo: IRepo; }>(); // { clock, repo }, each resolved by name
provider.resolve<[IClock, IRepo]>(); // [clock, repo]
```

An intersection has no synthesis: it is satisfiable only by one registration matching every member,
and the whole-type lookup is that search.

### 9. Open registrations and type-argument injection

Register `ILogger<T>` once and resolve `ILogger<User>`, `ILogger<Order>`, any closing at all. A
registration's address may carry a generic hole; a request closes it by unification, and the match's
bindings fill the implementer's signature. An arg that IS the hole receives its closing type as a
constant — an erased type parameter has nothing else to run on — which is what a `Typeof<T>`
parameter reads: the closing type's `NamedType`, not an instance of it. A hole standing inside a
larger arg closes into that expression and resolves as any other dependency.

```ts
class Logger<T> {
  constructor(factory: ILoggerFactory, category: Typeof<T>) {}
}
services = services.add<ILogger<T>>(Logger); // T from primitives.extras: the hole

provider.resolve<ILogger<User>>(); // a Logger whose category is typefor<User>()

// explicit:
services = services.add(
  Type.imported('ILogger', 'app', [Type.generic('T')]),
  Logger,
  Type.ctor(Type.imported('Logger', 'app', [Type.generic('T')]), [[typefor<ILoggerFactory>(), Type.generic('T')]]),
);
```

A registration addressed by nothing but a hole would unify with every request; the
`validateUniversalAddresses()` addon rejects one at build.

### 10. Callable slots: latebound factories and invokers

A parameter typed as a function is a factory the container writes for you. A function-typed
address resolves to a function: each call plans the return type with the call's own arguments bound
positionally to the signature row whose arity fits, and an argument the caller supplies outranks
every registration of that type — the manifest is never consulted for it. A call may stop short of
the full row wherever the remaining slots admit `undefined`.

```ts
class Report {
  constructor(
    private readonly log: ILogger, // container-resolved
    public readonly customer: string, // caller-supplied
  ) {}
}
services = services.add<ILogger>(ConsoleLogger).add<Report>(Report);

const makeReport = provider.resolve<(customer: string) => Report>();
makeReport('acme'); // log from the container, 'acme' threaded straight through
```

`resolve(callableType, callable)` is the value path — construct or call something you hold in your
hand with its dependencies filled in, registering and caching nothing. Two calls build two
instances, even for a class separately registered under its own address.

```ts
const report = provider.resolve(typefor(Report), Report); // fresh, never registered
```

### 11. Keyed registrations

A key is a tag on the address, so a keyed type is one type rather than a type plus an argument, and
a constructor asks for the keyed one by type alone. `Keyed<IStore, 'sql'>` derives as `IStore`
wearing the tag `sql`, `taggedAs('sql')` on the `describe` chain files under it, and a parameter
typed `Keyed<IStore, 'sql'>` asks for exactly that. A tagged address is distinct from the bare one,
so `IStore[]` collects the untagged registrations only, and a type wears at most one tag.

```ts
services = services
  .add<IStore>(RedisStore) // the plain registration
  .add(services.describe<IStore>().taggedAs('sql').asClass(SqlStore));

provider.resolve<IStore>(); // RedisStore
provider.resolve<Keyed<IStore, 'sql'>>(); // SqlStore

class Audit {
  constructor(private readonly store: Keyed<IStore, 'sql'>) {}
}

// explicit: what Keyed<IStore, 'sql'> is
provider.resolve(Type.tag(typefor<IStore>(), 'sql'));
```

`Inject<T, 'token'>` pins a parameter's address outright, overriding what its declaration would
derive; the value type stays `T`.

### 12. One chain: middleware and the engine's door

Every cross-cutting concern — tracing, scoping, validation, a fallback source — is a middleware on
one request-grain pipeline, and the engine is just its innermost element. The builder composes each
addon's middleware in call order around the engine; beneath the engine stands the chain's terminus,
which throws `UnsatisfiableError`. The engine answers what its registrations can produce and hands
an address no registration matches on through `next`, so a middleware above it sees every ask on the
way down and every answer — or refusal — on the way back up.

```ts
const observing: Addon<unknown> = {
  registrations: [],
  middleware: next => request => {
    seen.push(request.type);
    return next(request);
  },
};
```

A `Request` is the address being resolved plus whatever a middleware attaches on the way down
under a symbol it exports — attached before `next`, since the object is shared with every layer
beneath, and reachable only through an import a reviewer can see. A `ServiceRequest` — the arm a
provider mints — also carries the provider that opened the ask. The chain composes once, at build:
a middleware factory runs exactly once and may do install-time work there, resolving through
`next` whatever that work needs.

```ts
const SCOPE: unique symbol = Symbol('scope');
const scoping: Middleware = next => request => {
  request[SCOPE] = openScope();
  return next(request);
};
```

At install time a middleware reaches the engine's own controls through the same door, by minting a
`ControlRequest` for `ControlService`. Its two hook verbs install a `Behavior` — any of
`beforePlan` / `beginResolve` / `beforeConstruct` / `canonicalize` / `afterConstruct` — in one of
two tiers.
`installHooks(hooks)` is always active: the hooks run for every ask, outermost — the audit and
diagnostics tier. `stageHooks(hooks)` is gated: the hooks run only for an ask that activated the
answered `Handle`, which is how a scope layer keeps its behavior to the asks that flowed through
it — two parallel layers over one chain never run each other's staged hooks, and a latebound
closure invoked later still runs the hooks of the layer it was minted under. Either verb answers a
disposable `Handle`; disposing it is the uninstall. Construction hooks fire only at
registration-carrying nodes — never at an engine-synthesised object, tuple, or collection node,
and never at the engine's own seeded rows. `beforePlan` is the graph moment rather than the
resolve moment: it runs once per registered node as the plan is made — lazily at the first
resolution that needs it, or up front when `validateBuildability()` plans every address at build —
answering the state the node's dependencies are planned under, so a validator can judge the whole
graph without plan trees ever reaching the public surface.

```ts
const scopeLayer: Middleware = next => {
  const control = next(new ControlRequest(typefor<ControlService>())) as ControlService;
  const handle = control.stageHooks({ afterConstruct: (construction, instance) => scope.keep(construction, instance) });
  return request => next(request.activate(handle));
};
```

### 13. The ask itself is a service

A factory can take the resolution it is running under. A slot typed `ServiceRequest` receives the
live ask — its address in `type`, the provider that opened it in `serviceProvider` — with no
registration anywhere: the planner answers a slot naming `Request`, `ServiceRequest` or
`ControlRequest` from the ask in flight. The arm is checked: a `ServiceRequest` slot refuses under
a middleware's fold-time `ControlRequest`, and a slot typed by the base `Request` accepts either.

```ts
services = services.add(
  typefor<IAudit>(),
  (request: ServiceRequest) => new Audit(request.type, request.serviceProvider),
  Type.func(typefor<IAudit>(), [[typefor<ServiceRequest>()]]),
);
```

That is also all `IServiceProvider` is: the engine seeds an ordinary factory registration reading
the request, so a constructor parameter typed `IServiceProvider` receives a fresh view forwarding
to the provider that opened the ask — never the container object itself, since provider identity
is not a contract. The engine's two seeded rows — `IServiceProvider` and `ControlService` — file
oldest, carry a `null` lifetime, and are visible in `ControlService.registry` like anything else;
registering your own `IServiceProvider` shadows the seed.

A provider is also where disposal enters: `IServiceProvider` is disposable in both forms, so a
holder writes `using provider = Builder…build()` or `await using` and the provider is disposed on
the way out — idempotently, and for free when nothing subscribed. Disposal never flows through
`getService`, so no middleware observes it; an addon that must know when a particular provider
ends subscribes on that provider (`ServiceProvider.whenDisposed`), and each subscriber is told
once, most recent first, through whichever form the holder used.

### 14. Shadowing resolves beneath: decoration with no verb

Registrations at one address shadow, newest first — and a registration whose own slot names its
own address resolves that slot from what it shadows, because matching for a self-named slot starts
after the registration being planned. So a factory for `Foo` shaped `Func<[Foo], Foo>` is a
decorator with no decorator verb: it receives the older `Foo` and answers the address itself.

```ts
services = services
  .add(typefor<IFoo>(), PlainFoo, typefor(PlainFoo))
  .add(typefor<IFoo>(), (foo: IFoo) => new LoggingFoo(foo), Type.func(typefor<IFoo>(), [[typefor<IFoo>()]]));

provider.resolve<IFoo>(); // a LoggingFoo wrapping the PlainFoo
```

A self-named slot with nothing older is unsatisfiable — the ask throws rather than delegating —
and a collection ask still enumerates every match, decorator and shadowed both, in authored order.
Only the self-named slot resolves beneath: a genuine cycle through a second address still throws
`CycleError`.

### 15. Validation addons

Find every broken registration before the first ask, all at once. Two addons sweep the manifest at
build and throw `ManifestValidationError` carrying every failure together, so one attempt surfaces
the whole broken graph. `validateUniversalAddresses()` rejects a registration addressed by nothing
but a hole; `validateBuildability()` plans every closed address the manifest answers, and a plan
that cannot build is a failure.

```ts
const provider = Builder
  .withServices(services => services.add<IRepo>(SqlRepo)) // IRepo needs an IClock nobody registered
  .useAddon(validateBuildability())
  .build(); // throws ManifestValidationError naming IRepo, before any ask
```

Your own build-time sweep is a middleware away: `ControlService.registry` is the registrations the
container resolves against, read through the door at fold time.

```ts
const control = next(new ControlRequest(typefor<ControlService>())) as ControlService;
for (const registration of control.registry) {
  inspect(registration);
}
```

### 16. The standard lifetime model

Three lifetimes, scopes, and disposal — a clone of Microsoft.Extensions.DependencyInjection's
service lifetimes, on this repository's own API. `standardLifetime()` is an addon: install it and
every constructed registration names `'singleton'`, `'scoped'` or `'transient'`. A singleton is one
instance per container, shared by every scope. A scoped registration is one instance per scope. A
transient is fresh per ask and per injection site. A value registration is handed back as it stands.

```ts
await using provider = Builder
  .useAddon(standardLifetime())
  .withServices(services =>
    services
      .add<IClock>(SystemClock, 'singleton')
      .add<IRepo>(SqlRepo, 'scoped')
      .add<IReport>(Report, 'transient')
  )
  .build();

using scope = provider.resolve<IServiceScopeFactory>().openScope();
const repo = scope.resolve<IRepo>(); // this scope's own; another scope gets another
scope.resolve<IRepo>() === repo; // true
provider.resolve<IClock>() === scope.resolve<IClock>(); // true: the container's one instance
```

A scope is its provider. `IServiceScopeFactory` is resolvable from every provider and is always the
same instance; `openScope()` answers a new `IServiceProvider` that is a direct child of the
container, never of the scope the factory was resolved from — scopes are flat and share nothing but
the singletons. `IServiceProvider` resolved inside a scope is that scope's own provider; injected
into a singleton, it is the container's, wherever the singleton was first reached.

Disposal follows ownership. Disposing a scope's provider — `using`, or `Symbol.dispose` by hand —
disposes every instance that scope constructed, most recent first, each once, and the scope refuses
every later ask with `ObjectDisposedError`. Disposing the container's provider does the same for the
singletons and closes every provider. A transient is owned by the scope the ask ran under: resolved
from a scope, it goes with the scope; resolved from the container's provider, it is held until the
container disposes; injected into a singleton, it lives as long as the singleton. An instance handed
to a value registration is never disposed. Errors raised while disposing are collected — one
rethrows as itself, several as one `AggregateError` — and every other instance still disposes.

```ts
const scope = provider.resolve<IServiceScopeFactory>().openScope();
const conn = scope.resolve<IConnection>(); // scoped, disposable
await scope[Symbol.asyncDispose](); // conn[Symbol.asyncDispose]() runs here
scope.resolve<IConnection>(); // throws ObjectDisposedError
```

`await using` awaits each instance's `Symbol.asyncDispose` and calls a synchronous-only one directly.
`using` calls `Symbol.dispose` and counts an instance offering only `Symbol.asyncDispose` as an
error, so a container holding asynchronous disposables is disposed with `await using`.

A scoped registration reached through the container's own provider is cached with the singletons —
silently, exactly as Microsoft.Extensions.DependencyInjection does without scope validation.
`validateScopes()` is the optional layer that refuses it: a scoped registration resolved from the
container's provider, directly or beneath a transient, throws `ScopeValidationError` on every ask;
a scoped registration consumed by a singleton — directly, through a transient, or through another
singleton — throws `ScopeValidationError` wherever the singleton's dependencies are first planned,
from any provider. A singleton may hold `IServiceScopeFactory`: it is a value, never constructed,
so it trips neither check.

```ts
const provider = Builder
  .useAddon(standardLifetime())
  .useAddon(validateScopes())
  .withServices(services => services.add<IRepo>(SqlRepo, 'scoped'))
  .build();

provider.resolve<IRepo>(); // throws ScopeValidationError: reached from the container's provider
provider.resolve<IServiceScopeFactory>().openScope().resolve<IRepo>(); // answered
```

To refuse a captive dependency at build rather than at the first ask, add `validateBuildability()`
ahead of `validateScopes()` — the chain folds innermost first, so the build-time plan runs under the
captive check only when the validator that plans is composed outside the one that checks — and the
refusal arrives inside the `ManifestValidationError`, paired with the singleton whose plan reached
the scoped registration.

```ts
Builder
  .useAddon(validateBuildability())
  .useAddon(validateScopes())
  .useAddon(standardLifetime())
  .withServices(services => services.add<IRepo>(SqlRepo, 'scoped').add<ICache>(Cache, 'singleton')) // Cache takes an IRepo
  .build(); // throws ManifestValidationError; the ICache failure's error is a ScopeValidationError naming IRepo
```

### 17. The tagged lifetime model

Name your own lifetimes, open a scope per name, and nest them in whatever order the program runs
in. `taggedLifetime<Lifetime>()` is an addon over the vocabulary you spell: each constructed
registration carries one of your tags, `openScope(tag)` answers a provider caching the registrations
of that tag alone, and a scope opened from inside another scope chains onto it — an ask through the
inner scope is checked by both, the inner one first, and a hit anywhere on the chain answers the
cached instance. A registration whose lifetime is `undefined`, or omitted, is transient: fresh on
every ask, from every provider.

```ts
type Lifetime = 'session' | 'request' | undefined;

await using provider = Builder
  .useAddon(taggedLifetime<Lifetime>())
  .withServices(services =>
    services
      .add<ISession>(Session, 'session')
      .add<IUnitOfWork>(UnitOfWork, 'request')
      .add<IReport>(Report) // transient
  )
  .build();

using session = provider.resolve<ITaggedServiceScopeFactory<Lifetime>>().openScope('session');
using request = session.resolve<ITaggedServiceScopeFactory<Lifetime>>().openScope('request');

request.resolve<ISession>() === session.resolve<ISession>(); // true: the session scope's one instance
request.resolve<IUnitOfWork>() === request.resolve<IUnitOfWork>(); // true: this request scope's own
session.resolve<IUnitOfWork>() !== session.resolve<IUnitOfWork>(); // true: no request scope on that chain
```

The provider `build()` answers caches nothing and captures nothing: through it every registration,
tagged or not, is constructed afresh. The same holds for a tag with no open scope on the chain — a
`'request'` registration asked of a `'session'` scope, or of the built provider, is a transient
there and is cached again the moment a `'request'` scope is on the chain. Only the scopes on the
chain decide, so there is no order in which scopes must open: a `'session'` scope inside a
`'request'` scope caches the session tag all the same. Where two scopes of one tag nest, the inner
one wins for asks through it and the outer one keeps its own.

`ITaggedServiceScopeFactory<Lifetime>` is a registration like any other, constructed on every
resolution and bound to the provider the ask came from — asked for directly or injected into a
service, it opens scopes over that provider. The binding follows the ask, not the cache: a factory
injected into a service the `'session'` scope caches, when that service is first asked for through
a `'request'` scope beneath it, is bound to the `'request'` scope the ask came from. Resolving the
factory spells the vocabulary out every time; wrap that in a helper so the rest of the program does
not depend on the union:

```ts
function openScope(provider: IServiceProvider, tag: Exclude<Lifetime, undefined>): IServiceProvider {
  return provider.resolve<ITaggedServiceScopeFactory<Lifetime>>().openScope(tag);
}
```

Disposal follows the cache. Disposing a scope's provider — `using`, or `Symbol.dispose` by hand —
disposes every instance that scope cached, most recent first, each once, and that scope, with every
scope opened beneath it, refuses every later ask with `ObjectDisposedError`. A transient is never
captured: resolved from a scope, from the built provider, or injected into a cached service, it is
yours to dispose. An instance handed to a value registration is never disposed either. Errors raised
while disposing are collected — one rethrows as itself, several as one `AggregateError` — and every
other instance still disposes; `await using` awaits each instance's `Symbol.asyncDispose` and calls
a synchronous-only one directly, while `using` counts an instance offering only
`Symbol.asyncDispose` as an error. Disposing the built provider closes every provider but disposes
nothing: what an open scope holds is disposed with that scope.

```ts
const request = session.resolve<ITaggedServiceScopeFactory<Lifetime>>().openScope('request');
const work = request.resolve<IUnitOfWork>(); // cached by the request scope, disposable
await request[Symbol.asyncDispose](); // work[Symbol.asyncDispose]() ran here; the session scope's instances are untouched
request.resolve<IUnitOfWork>(); // throws ObjectDisposedError
```

---

Every failure mode is a typed subclass of `DiError`, so a caller branches on `instanceof` instead of
parsing a message, and a library holding only the abstractions can classify what a caller's
container threw at it. `UnsatisfiableError` — nothing produces the address; the candidate to fall
back from, carrying the actual missing dependency as its `cause`. `CycleError` — the graph loops,
with the path that closed it; a fault, deliberately not unsatisfiable. `UniversalAddressError` — a
registration addressed by a bare hole. `ManifestValidationError` — every registration an up-front
pass could not plan, `failures` pairing each with its address. `LifetimeModelError` — the installed
lifetime model's own code threw while realizing an address; the model's error is the `cause`.
`ObjectDisposedError` — an ask or a scope opening reached a provider whose container or scope has
ended. `ScopeValidationError` — a scoped registration reached under the singleton scope, from the
container's own provider or consumed by a singleton, with the scoped `address`.

```ts
catch (error) {
  if (error instanceof UnsatisfiableError) {
    return fallback;
  }
  throw error; // a CycleError, a fault in the registrations, passes through
}
```

## Design notes

### Explicit forms are primary

Nothing here needs a build step to work. Every capability above is fully usable with the addresses
spelled out: `typefor<T>()` at the use site names a type, `Type.from(token)` reads one from a
string, and the `Type` factories compose one. The type-argument sugar `di.extras` carries —
`add<I>(Ctor)`, `resolve<I>()`, `describe<I>()` — is exactly the explicit call with the addresses
derived, never a capability of its own, so a library compiled once runs for every consumer whether
or not they compile with the transform.

```ts
services = services.add<IClock>(SystemClock);
// is
services = services.add(typefor<IClock>(), SystemClock, typefor(SystemClock));
// is
services = services.add(Type.imported('IClock', 'app'), SystemClock,
  Type.ctor(Type.imported('SystemClock', 'app'), [[]]));
```

### Identity is load-bearing

A registration matches a request by interned identity — an open one by unification — so two
spellings of one type must be one object, and they are. `primitives` and `di.core` each stamp
themselves at load and fail fast on a second copy: a duplicate would fork the intern table, and fork
`DefaultManifest` so augmentations installed onto one copy's prototype never reach manifests built by
the other. Every bundle keeps both external.
