# `@rhombus-std/di`

`di.core` (the abstractions: the immutable `Manifest` and its `Registration`s, the `describe`
chain, `Addon` / `Middleware` / `Request`, `IServiceProvider`, the whole error taxonomy, and the
`Control` carrier) ← `di` (the engine: `Builder`, the plan-and-realize resolution core, the
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

### 1. The builder and the chain

A provider is assembled through one surface: `Builder.withServices(fn)` installs the registrations
`fn` composes onto an empty manifest, `Builder.useAddon(addon)` installs an addon, and either may
open the chain. Every input threads one lifetime vocabulary — `unknown` until the first input
carrying one locks it on, and fixed for the chain from there. `build()` seals the chain into an
`IServiceProvider`.

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
contributing no middleware of its own.

```ts
const addon: Addon<unknown> = {
  registrations: [Registration.value(typefor<IClock>(), new SystemClock())],
  middleware: next => next,
};
```

### 2. The manifest is immutable

`Manifest` is an iterable chain of registrations, newest first. Every registration verb — `add`,
`tryAdd`, `replace`, `remove`, `removeAll`, `addValue` and their kin — returns a NEW manifest
wrapping the one it was called on, and the receiver itself is untouched. A call whose result is
discarded registers nothing. A verb that changes nothing returns the receiver itself, so `===`
answers "did this change anything".

```ts
let services = Manifest.empty();
services = services.add<IClock>(SystemClock); // ← must be kept
services.add<IRepo>(SqlRepo); // ← LOST: result discarded, SqlRepo never registered

services = services.tryAdd<IClock>(WallClock); // IClock already has a registration: the receiver, unchanged
services = services.replace<IClock>(WallClock); // swaps the first IClock registration, everything else untouched
services = services.removeAll<IClock>(); // every IClock registration gone
```

`add` also takes a whole manifest, merged as one batch in its own order, or any iterable of
registrations, filed one after another.

```ts
services = services.add(Manifest.build(m => m.add<IClock>(SystemClock)));
```

### 3. Registrations and the `describe` chain

A registration is plain data: an `address` (a `Type`) and one implementer — a `ctor` the engine
`new`s, a `factory` it calls, or a `value` it hands back as it stands. The member naming the
implementer says which door it came in by, because the implementer's own type cannot: a function
registered as a value is handed back, the same function registered as a factory is called. A
constructor or factory carries its own type beside it — `ctorType` / `factoryType` — which is where
its signatures live.

```ts
Registration.ctor(typefor<IClock>(), SystemClock, typefor(SystemClock));
Registration.factory(typefor<IClock>(), makeClock, typefor(makeClock));
Registration.value(typefor<IClock>(), new SystemClock());
```

`describe` opens a chain that builds one: choose the implementer through an `as*` door, refined by
`withLifetime` and `taggedAs`. Each step hands back a new node and spends its own slot, so none can
be taken twice; once a door is taken the node IS a `Registration` — hand it to the
registration-taking verbs, hold it in a variable, or build several in a helper and register them
together.

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

### 4. Lifetime is a vocabulary

A registration carries a `lifetime` from the chain's vocabulary — the `Lifetime` type argument on
`Manifest<Lifetime>` and `Builder<Lifetime>`. A vocabulary that admits `undefined` lets the
argument be omitted; one that does not makes every constructed registration name a value, and the
`describe` chain withholds registration-ness until `withLifetime` is taken. What a value MEANS —
how long the construction is kept, and where — is the lifetime model's own concern, installed as an
addon that reads each registration's `lifetime` at runtime. The engine promises only which node a
construction happens at.

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

`resolveAsync<T>()` is the one path that awaits: it asks for `Promise<T>` and settles everything
beneath that only a promise registration can answer, in one wait. Plain `resolve()` never awaits
anything — asking it for the `Promise<T>` type itself hands back a promise as a value. Full
mechanics: `docs/features/async-resolution.md`.

```ts
services = services.add<Promise<IBanner>>(fetchBanner);

const banner = await provider.resolveAsync<IBanner>(); // awaits the Promise<T> registration
const pending = provider.resolve<Promise<IBanner>>(); // same registration, un-awaited
```

### 6. Collection resolution

Three wrapper addresses resolve over the same aggregate — `T[]`, `Iterable<T>` and
`AsyncIterable<T>` — each walking every registration of `T` in registration order, with the
element's own synthesis (if `T` has one) as the tail. `T[]` is a snapshot, every element realized
eagerly; `Iterable<T>` is a live query, each iteration step realizing one element, re-iterable;
`AsyncIterable<T>` settles one element per step. An unregistered element type aggregates to an
empty collection; the bare element address still throws. `resolveMany<T>()` is `Iterable<T>` by
name.

```ts
services = services.add<IGreeting>(FormalGreeting).add<IGreeting>(CasualGreeting);

provider.resolve<IGreeting[]>(); // [formal, casual] — registration order
provider.resolveMany<IGreeting>(); // Iterable<IGreeting>: lazy, re-iterable, same elements

provider.resolve<IPlugin[]>(); // no IPlugin registered anywhere → [], never throws
provider.resolve<IPlugin>(); // same case, bare address → throws UnsatisfiableError
```

### 7. Whole-type precedence, unions, and optional dependencies

Every ask is answered the same way: the registrations matching the whole address, newest first,
and only on a miss the address kind's own synthesis. A union is one such kind. A parameter typed as
a union is satisfied by a registration of the union itself if one exists, and otherwise by the
first member that resolves, in the union's canonical member order — falling through past a member
nothing produces and past one whose graph has a hole. Exhausting every member throws.

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

Canonical order puts literals last, which is what makes an optional dependency work with no special
case: `dep?: IFoo` is `IFoo | undefined`, and the `undefined` literal serves only once `IFoo` itself
has no way to build. A caller for whom absence is an answer spells that in the address it asks for.

```ts
provider.resolve(Type.union(typefor<IFoo>(), typefor<undefined>())); // IFoo, or undefined — never a throw
```

### 8. Synthesis on a miss: literals, objects, tuples

A literal address is its own value, injected directly with no registration involved. An object
type with no registration of its own is built from its properties — all of them or none, so one
unresolvable property leaves the whole object unsatisfiable rather than half-built. A tuple is
built the same way, member by member.

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

A registration's address may carry a generic hole; a request closes it by unification, and the
match's bindings fill the implementer's signature. An arg that IS the hole receives its closing
type as a constant — an erased type parameter has nothing else to run on — which is what a
`Typeof<T>` parameter reads: the closing type's `NamedType`, not an instance of it. A hole standing
inside a larger arg closes into that expression and resolves as any other dependency.

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

A function-typed address resolves to a function: each call plans the return type with the call's
own arguments bound positionally to the signature row whose arity fits, and an argument the caller
supplies outranks every registration of that type — the manifest is never consulted for it. A call
may stop short of the full row wherever the remaining slots admit `undefined`.

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

`resolve(callableType, callable)` is the value path: it constructs or calls the callable the
caller hands over, its dependencies resolved from the callable's own type, registering and caching
nothing — two calls build two instances, even for a class separately registered under its own
address.

```ts
const report = provider.resolve(typefor(Report), Report); // fresh, never registered
```

### 11. Keyed registrations

A key is a tag on the address, so a keyed type is one type rather than a type plus an argument:
`Keyed<IStore, 'sql'>` derives as `IStore` wearing the tag `sql`, `taggedAs('sql')` on the
`describe` chain files under it, and a parameter typed `Keyed<IStore, 'sql'>` asks for exactly
that. A tagged address is distinct from the bare one, so `IStore[]` collects the untagged
registrations only and a type wears at most one tag.

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

### 12. Middleware and the engine's door

One request-grain pipeline serves every ask. The builder composes each addon's middleware in call
order around the engine, which is the innermost element; beneath the engine stands the chain's
terminus, which throws `UnsatisfiableError`. The engine answers what its registrations can produce
and hands an address no registration matches on through `next`, so a middleware above it sees
every ask on the way down and every answer — or refusal — on the way back up.

```ts
const observing: Addon<unknown> = {
  registrations: [],
  middleware: next => request => {
    seen.push(request.type);
    return next(request);
  },
};
```

A `Request` is the address being resolved, the provider that opened the ask, and whatever a
middleware attaches on the way down under a symbol it exports — attached before `next`, since the
object is shared with every layer beneath. The chain composes once, at build: a middleware factory
runs exactly once and may do install-time work there, resolving through `next` whatever that work
needs.

```ts
const SCOPE: unique symbol = Symbol('scope');
const scoping: Middleware = next => request => next({ ...request, [SCOPE]: openScope() });
```

### 13. Validation addons

Two addons sweep the manifest at build and throw `ManifestValidationError` carrying every failure
at once, so one attempt surfaces the whole broken graph. `validateUniversalAddresses()` rejects a
registration addressed by nothing but a hole; `validateBuildability()` plans every closed address
the manifest answers, and a plan that cannot build is a failure.

```ts
const provider = Builder
  .withServices(services => services.add<IRepo>(SqlRepo)) // IRepo needs an IClock nobody registered
  .useAddon(validateBuildability())
  .build(); // throws ManifestValidationError naming IRepo, before any ask
```

A middleware sweeping the manifest reads it through the roster ask, which the engine answers itself
with the registrations it resolves against.

```ts
const roster = next({ type: typefor<Control<Iterable<Registration<unknown>>>>(), serviceProvider });
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

Every capability above is fully usable with the addresses spelled out: `typefor<T>()` at the use
site names a type, `Type.from(token)` reads one from a string, and the `Type` factories compose
one. The type-argument sugar `di.extras` carries — `add<I>(Ctor)`, `resolve<I>()`,
`describe<I>()` — is exactly the explicit call with the addresses derived, never a capability of
its own.

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
spellings of one type must be one object. `primitives` and `di.core` each stamp themselves at load
and fail fast on a second copy: a duplicate would fork the intern table, and fork `DefaultManifest`
so augmentations installed onto one copy's prototype never reach manifests built by the other.
Every bundle keeps both external.
