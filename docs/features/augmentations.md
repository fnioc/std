# Augmentations

An **augmentation** adds members to an interface after the fact — dot-callable on every value of
that interface, without touching the interface's declaring package. This doc describes the
mechanism: the behavior it guarantees, how to author one, how to consume one, how it actually
works, and what to watch out for.

## The behavior

Once an augmentation exists, `builder.addJsonFile('appsettings.json')` compiles for **every** value
statically known as an `IConfigBuilder` — a concrete class that implements it, a subinterface of
it, an interface-typed variable or field, a generic type parameter constrained to it. Nobody who
writes a new `IConfigBuilder` implementation has to do anything for `addJsonFile` to show up on it;
the member rides the **declared interface identity** (nominal dispatch, resolved at compile time
against the interface, never against a concrete type's name or shape), and the receiver's declaring
package never knows.

TypeScript's type system is structural and has no native after-the-fact member syntax, so the
mechanism is built rather than borrowed:

- A member declared once against an interface must appear, **typed**, on every value statically
  known as that interface — implementers, subinterfaces, interface-typed references, constrained
  generics alike.
- It must be **actually callable** (`receiver.member(...)`, not `member(receiver, ...)`) on every
  concrete implementer, present or future, without that implementer's author writing anything
  beyond `implements TheInterface`.
- Authoring a new member must not require touching, or even being aware of, every existing (or
  future) concrete class.

Two things make this hard in TS: there's no hook that runs "whenever a class implements this
interface," and a `declare module` interface merge only changes the **type**, not the **runtime**
prototype — a class can typecheck as having a member it will throw on calling. The rest of this doc
is the machinery that closes both gaps.

## Authoring an augmentation (first-party only)

Authoring a _new_ augmentation — adding a brand-new member to a receiver interface — is a
first-party-only capability. Downstream/consumer packages implement receivers and get every
augmentation for free (next section); they don't get to mint new ones. This is a deliberate design
boundary, not a temporary gap.

Steps, for a receiver interface `IConfigBuilder`:

**1. Decide OPEN or CLOSED.** A receiver is **OPEN** if it's extended by downstream packages that
load after its concrete class already exists (`Manifest`, `IConfigBuilder`, `ILoggingBuilder`,
`IMetricsBuilder`, `ITracingBuilder`, `IHost`, `IHostBuilder`, `IHostEnvironment`) — these need the
token registry (see below). A receiver is **CLOSED** if the interface (or concrete class) and every
one of its augmentations live inside one family's own package (`MemoryCacheEntryOptions`,
`MetricsOptions`, `LoggerFilterOptions`) — these install directly, no token needed.

**2. Name the file `<Receiver>-<Topic>-augmentations.ts`**, where `Receiver` is the receiver's name
with a leading `I` dropped and `Topic` is a short word for the member group (`Json`, `Descriptor`,
`Service`, `Sugar`).

**3. Write the implementation as a namespace of exported function declarations.** This namespace is
the one place a member's shape is written — its parameters, its generics, its documentation — and
every other surface an augmentation touches derives from it.

The simplest shape is a receiver with no type parameter and no chaining:

```ts
export namespace ServiceScopeFactoryServiceAugmentations {
  export function createAsyncScope(this: IServiceScopeFactory): AsyncServiceScope {
    /* ... */
  }
}
```

Each function takes the receiver as an explicit `this` parameter, with real, named parameters and a
real return type. The namespace is exported, which is what makes each member reachable standalone;
there is no separate member-map type declaring the same signature a second time.

**A receiver with its own type parameter can't be mirrored by a generic namespace** — namespaces
don't take type parameters — and the answer is not to reconstruct one per function. The namespace
is the implementation and writes the receiver's type argument at its widest: `Manifest<string>` in,
`Manifest<string>` out, plain `string` for a scope parameter. The caller-facing face is the
`declare module` block (step 4), and that is where the receiver's own `Scopes` is spelled:

```ts
export namespace ManifestServiceAugmentations {
  export function addValue(this: Manifest<string>, type: string | Type, value: unknown,
    key?: string): Manifest<string> {
    return this.add(ServiceDescriptor.value(withKey(type, key), value));
  }
}

declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string> {
    addValue(type: string | Type, value: unknown, key?: string): Manifest<Scopes>;
  }
}
```

Calling `.addValue(...)` on a `Manifest<'singleton'>` hands back a `Manifest<'singleton'>`, because
that is what the declared face says. It does not hand back the receiver's own concrete class, and
the face must not say `this`: the chain is immutable, so every verb produces a fresh node rather
than the object it was called on.

**A per-function `Self` generic is still the answer for one case: two receivers, one namespace.**
Where one member map merges into two receivers that aren't assignable to one another —
`IConfigBuilder` and `config`'s own `ConfigBuilder<T>`, neither a subtype of the other — `Self` is
constrained to a small NAMED structural type declared in the same file, spelling exactly the
members the bodies touch:

```ts
/** The subset of {@link IConfigBuilder} and `config`'s `ConfigBuilder<T>` this sugar's `add` calls touch. */
interface ConfigSourceBuilder {
  add(source: IConfigSource): unknown;
}

export namespace ConfigBuilderJsonAugmentations {
  export function addJsonFile<Self extends ConfigSourceBuilder>(this: Self, path: string,
    opts?: JsonConfigSourceOptions): Self {
    return this.add(new JsonConfigSource(path, opts)) as Self;
  }
}
```

**No rest parameters, anywhere, in a namespace function's implementation.** A member with several
call shapes declares several real overloads, each with its own named parameters — the sugar `add`
contributes three (a configure lambda, a constructor, a factory), never one signature padded with
`...args: any[]`. A genuinely variadic member still can't end its _implementation_ in a bare rest:
it keeps a leading named parameter and only then a trailing rest. `tryAdd`'s overload declarations
can spell `...descriptors: ReadonlyArray<ServiceDescriptor<string>>` on their own, because a
declared overload is just a call shape — but the implementation underneath every overload reads:

```ts
export function tryAdd(this: Manifest<string>, first: ServiceDescriptor<string> | Type | string,
  ...rest: readonly any[]): Manifest<string> {
  /* ... */
}
```

`first` is named; only what follows it is a rest. The inline stage reads a namespace function's
_implementation_ as the exact declared face it serves a call against — same type-parameter count,
same value parameters by name and order — so a bare rest there would let the implementation serve
any declaration of matching type-parameter count, including an unrelated one it was never meant to
answer for. Authoring one is a loud, load-time `INLINE_REST_BODY` error naming the file and member,
not a silent widening. A call that stops short of the implementation's own optional tail simply
omits those trailing arguments from the emitted call — it isn't padded with `undefined`.

**4. Merge the namespace onto the receiver interface with `Flatten<typeof TheNamespace>`,** in the
same file as the receiver's own declaring module:

```ts
declare module '@rhombus-std/config.core' {
  interface IConfigBuilder extends Flatten<typeof ConfigBuilderJsonAugmentations> {}
}
```

`Flatten` restates the namespace's member types as a plain object type, which is what an `extends`
clause needs; the namespace's own generics and parameter names pass through unchanged. The `declare
module` target is always the receiver's **package specifier** — never a relative path. A relative
target (`declare module './configuration-builder.js'`) merges onto one internal module instance:
consumers resolving the receiver through the package barrel never see the merge, and the rolled
`.d.ts` cannot represent it. The bare specifier merges onto the package's public surface, survives
file moves, and rolls correctly. A receiver in your own package is no exception — target your own
package's name.

**A member name that another package also contributes to the same receiver duplicates its
signature directly in the `declare module` body, beside the `extends` clause.** TypeScript's
declaration merging treats a directly-declared member as shadowing one reached only through
`extends`, so when a name is reached only through `extends` on one side, it's invisible to a caller
holding the interface type even though it's genuinely there. Two `extends` clauses supplying the
same name never fold into an overload set on their own — naming it directly, on each side, is what
does. `di.core` and `di.extras` both contribute `addClass` to `Manifest`, with genuinely different
shapes (`di.core`'s takes an explicit `Type`; `di.extras`' tokenless sugar derives it from `T`), and
each duplicates its own signature in its own file:

```ts
// di.core's Manifest-service-augmentations.ts
declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string> {
    addClass(type: string | Type, ctor: Ctor, implementerType: ConstructorType, scope?: Scopes,
      key?: string): Manifest<Scopes>;
  }
}
```

```ts
// di.extras' Manifest-service-augmentations.ts
declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string> extends Flatten<typeof ManifestServiceAugmentations> {
    addClass<T>(this: Manifest, ctor: Ctor<any[], T>, implementerType: ConstructorType, scope?: string,
      key?: string): Manifest;
  }
}
```

**A duplicate is RECEIVER-SPELLED, not a transcript of the contributing function.** The block is the
face callers read, so it says what the receiver offers: the interface's own type parameters in
parameter positions (`scope?: Scopes`), `Manifest<Scopes>` as the return, and no `this` parameter
at all. A member with a leading explicit type parameter of its own keeps it — `addOptions<T>`,
`configure<T, Deps>` — and nothing else. What the implementation writes to get there is its own
business.

With both sides declaring their own signature directly, TypeScript's ordinary same-name-across-
partial-declarations merge folds them into one overload list, and `Manifest` sees both forms. Once
every member of a namespace is declared directly, the `extends Flatten<typeof TheNamespace>` clause
has nothing left to derive and goes; keep it only while underived members remain.

**A collision with the receiver's own primitive is ordinary when the shapes DO unify.** `Manifest`
declares `add`, `remove` and `replace` natively — they are the chain's whole substrate, public and
unadorned — and the sugar that describes a registration before adding it is contributed as further
`add` shapes on the same name. Nothing is duplicated to make that work: the primitive's face lives
on the interface, the sugar's on its own contributor's block, and step 5's merge strategy is what
decides which body a given call reaches. The rule for whether a sugar shape is worth contributing
at all follows from this: a shape whose entire body forwards to the primitive has nothing to say
that the primitive's own declaration doesn't, so it isn't written.

**A colliding member sometimes stays out of the `declare module` block entirely, reachable only at
runtime.** Where the collision is with the receiver's own hand-written primitive and the two call
shapes are genuinely incompatible, TypeScript refuses to unify them into overloads at all (TS2430),
so there's no signature to duplicate. `ILogger.log`/`beginScope` and `ILoggerFactory.createLogger`
are dot-callable at runtime through a merge strategy (installed in step 5) — a decorated logger
answers `logger.log(level, message, ...args)` correctly — but the typed call path for the
convenience shape stays the plain function, `log(logger, level, message, ...args)`, since TS can't
type it as an overload of `ILogger`'s own `log`.

A member can also be excluded because mounting it at all would recurse into itself — the wrapper
calls the receiver's own primitive in primitive shape, so installing it over that primitive would
have it call itself. `IDistributedCache.set` is this case: it's dropped from both the interface
merge and the install, reachable only standalone as
`DistributedCacheSugarAugmentations.set.call(cache, key, value, signal)`.

**5. Register the namespace — it is what gets installed, with nothing further to write:**

- **OPEN receiver** — pass the namespace straight to `registerAugmentations`, naming the receiver
  as an explicit type argument:

  ```ts
  import { registerAugmentations } from '@rhombus-std/primitives.extras';

  registerAugmentations<IConfigBuilder>(ConfigBuilderJsonAugmentations);
  ```

  Any class decorated `@augment(tokenfor<IConfigBuilder>())` — anywhere, imported in any order,
  defined before or after this call runs — picks the new member up automatically. A member that
  collides with the receiver's own primitive registers with a second argument, one merge strategy
  per colliding name:

  ```ts
  registerAugmentations<ILogger>(LoggerAugmentations, {
    log(original, incoming) {
      return function(this: ILogger, logLevel: LogLevel, second: unknown, ...rest: unknown[]) {
        return second instanceof EventId
          ? original.call(this, logLevel, second, ...rest)
          : incoming.call(this, logLevel, second, ...rest);
      };
    },
  });
  ```

- **CLOSED receiver** — call `applyAugmentations(ConcreteClass, TheNamespace)` directly, wherever
  the concrete class is defined:

  ```ts
  applyAugmentations(MemoryCacheEntryOptions, MemoryCacheEntryOptionsSugarAugmentations);
  ```

  Only the install call differs from the OPEN case; the namespace and its `declare module` merge
  are identical either way.

The namespace **is** the callable surface either way, with no installation step —
`ConfigBuilderJsonAugmentations.addJsonFile.call(builder, path)` already works, the way any plain
function is called on an explicit receiver. Installation is what additionally makes
`builder.addJsonFile(path)` work.

**Naming at a glance** — the file and the implementation namespace share the same `Receiver`/`Topic`
pair:

|                          | pattern                               | example                               |
| ------------------------ | ------------------------------------- | ------------------------------------- |
| file                     | `<Receiver>-<Topic>-augmentations.ts` | `ConfigBuilder-Json-augmentations.ts` |
| implementation namespace | `<Receiver><Topic>Augmentations`      | `ConfigBuilderJsonAugmentations`      |

**A per-function `Self` generic only binds from the receiver when a call writes no explicit type
argument** — which is why a face that needs the receiver's type argument spells it directly instead.
TypeScript fills the remaining type parameters from their _defaults_, not by inference, once a call
writes a partial type-argument list. A receiver-spelled declaration is immune: `addOptions<T>` on
`Manifest<Scopes>` returns `Manifest<Scopes>` whatever the caller writes for `T`, because `Scopes`
comes from the receiver rather than from inference. `di.extras`' tokenless sugar is still bound by
the rule — it writes `<T>` explicitly and takes a bare `string` scope, returning the
un-parameterized `Manifest` — because its own declarations reconstruct the receiver rather than
naming it.

## Implementing an augmented interface (the supported consumer feature)

This is the half of the story open to everyone, first-party or downstream: implement a receiver
interface and get its full augmentation surface for free, automatically, forever (including
augmentations registered _after_ your class is defined).

**1. Merge the interface onto the class — never `implements` it.** Declare an empty interface of
the same name extending the receiver interface, beside a class with no `implements` clause:

```ts
export interface MyConfigurationBuilder extends IConfigBuilder {}
export class MyConfigurationBuilder {
  add(source: IConfigSource): IConfigBuilder {/* ... */}
  build(): IConfig {/* ... */}
}
```

Declaration merging makes the interface part of the class's own type, so instances carry every
member of `IConfigBuilder` — its own and every augmented one, present and future — without the
class declaring them. This is the difference that matters: the merge **grants** members to the
type; `implements` **demands** them statically, and fails (TS2416) in any program where the
interface has augmented members, because those members only exist after the registry installs
them at runtime. A class that `implements` an augmentable interface is wrong by construction.
(`Manifest` in di.core is the canonical in-repo example of this shape.)

**2. Decorate the class with `@augment`, using the same token the augmentations were registered
under** — this is what actually installs the members at runtime:

```ts
@augment(tokenfor<IConfigBuilder>())
export class MyConfigurationBuilder {
  add(source: IConfigSource): IConfigBuilder {/* ... */}
  build(): IConfig {/* ... */}
}
```

That's it. Every augmentation on that token — the ones that existed when you wrote this class, and
every one registered on it afterward, by any package — now shows up as a real, typed, callable
method on instances, with zero further action on your part.

## How we pulled it off

**The registry.** A module-level `Map<string, Bag>` lives in `@rhombus-std/primitives` (the
universal zero-dep leaf every family can already reach), keyed by the token string. `Bag` is a
`Map<string, [fn, mergeStrategy?][]>` — a per-member-name list of contributions, each pairing its
function with its own collision strategy.

**Registering.** `registerAugmentations(receiver, set, merge?)` appends `set`'s members into the
receiver's bag, then synchronously drives just those new members onto every class already
subscribed to that receiver. `set` is the implementation namespace itself — at runtime a namespace
of only function exports compiles to a plain object mapping each name to its function, so it needs
no adapter to satisfy the same shape the registry has always taken. A second registration of the
same member name under a different namespace does not throw here — it just accumulates; the throw
(if any) happens at install time, per class.

**Decorating.** `@augment(token)` is a plain TC39 class decorator. The first time it's applied to a
class, it installs the token's _entire_ accumulated bag once (catch-up). It then subscribes that
class to receive only each _later_ registration's own delta — never replaying the whole bag again —
so a member reaches a given prototype exactly once no matter how many packages share the token.

**Delivery is a synchronous per-token subscriber list — deliberately not an `EventTarget` bus.**
`EventTarget.dispatchEvent` swallows a listener's thrown exception (it surfaces asynchronously as an
uncaught error, never back to the dispatcher); that would silently drop a genuine collision instead
of refusing it. Iterating plain subscriber callbacks directly lets a collision throw propagate
straight back to whoever called `registerAugmentations`.

**Collision resolution is blind.** Installing member `n` onto a prototype asks exactly one
question: is `n` already there?

- **No** → assign the authored function itself (`proto[n] = fn`) — the installed member IS the
  namespace's own function, so function identity holds, and re-installing the very same function is
  a silent no-op.
- **Yes, and a merge strategy was supplied for `n`** → mount a dispatcher that chains the new
  implementation over whatever was already there (both arms are `this`-based; the dispatcher
  forwards with `fn.call(this, ...args)`).
- **Yes, and no merge strategy** → **throw**, immediately, naming the class and the member. Never
  silently clobber.

No token, receiver, or "where did this come from" identity is ever consulted — purely "is this slot
taken." That's what lets an augmentation share a name with a class's own hand-written primitive
(`ILogger.log`/`beginScope`, `IMemoryCache.tryGetValue`, `ILoggerFactory.createLogger` — dot-callable
at runtime; not statically typed, TS2430) via an explicit merge strategy, while two unrelated
augmentations that happen to collide by name fail loud instead of one quietly overwriting the other.

**Tokens are values, not names.** A token is a plain string, derived inline at every call site via
`tokenfor<Receiver>()` — there are no exported token constants and no dedicated token type. The
nameof stage resolves `tokenfor<IConfigBuilder>()` to the literal string
`"@rhombus-std/config:IConfigBuilder"`; a hand-written, no-transformer caller just writes that
string directly. Two calls naming the same interface always produce the same token, regardless of
which package or file they're in. `registerAugmentations<IConfigBuilder>(TheNamespace)` reads the
same way — the receiver's type argument is what the nameof stage resolves into that token.

**Runtime identity is load-bearing.** Every package that bundles must keep `@rhombus-std/primitives`
**external**. An inlined copy of `primitives` forks the registry's `Map` and subscriber list into
two independent instances that never see each other — a class decorated against one copy of the
registry never receives augmentations registered against the other.

## Gotchas

- **OPEN vs CLOSED is a one-time call per receiver, not a spectrum.** Get it backwards and you
  either build registry plumbing a receiver never needed, or — the bug that motivated the registry
  in the first place — a legitimate downstream extender has no path to reach a concrete class it's
  never heard of (an independent builder never receiving an augmentation meant for it).
- **A namespace's functions are the entire contract — no rest parameters in an implementation,
  ever.** A member with several call shapes is several real overloads with named parameters; a
  genuinely variadic one leads with a named parameter before its trailing rest. The inline stage
  refuses a bare-rest implementation at load time (`INLINE_REST_BODY`) — a rest there could serve
  any declaration of matching type-parameter count, not just the one it was written for.
- **The namespace implements; the block is the face.** A receiver's own generic parameter has no
  counterpart on a namespace, so the implementation writes the receiver at its widest
  (`this: Manifest<string>`, plain `string` scopes) and the `declare module` block spells the
  receiver's own parameters — `scope?: Scopes`, returning `Manifest<Scopes>`, no `this` parameter.
  Never `this` as the return: an immutable chain hands back a fresh node, not the receiver.
- **Two non-assignable receivers sharing one namespace still need a per-function `Self`**, bound to
  a small named structural type declared alongside the namespace (`ConfigSourceBuilder`).
- **A per-function `Self` only binds from the receiver when a call writes no explicit type
  argument.** A caller that writes a partial type-argument list — `di.extras`' tokenless sugar
  always does — gets the remaining type parameters from their _defaults_, not inference, so a
  chaining form reached that way returns the bare receiver type. A receiver-spelled face sidesteps
  it: its return names `Scopes`, which is never inferred in the first place.
- **Merge-identity rule.** Every interface-side `declare module` merge for _one_ interface must
  resolve to the interface's own declaring module — same file, any specifier. Mixing a
  package-barrel specifier with a relative/declaring-module specifier for the _same_ interface
  makes TS treat the accumulated `this`-typed members as having unrelated `this` types, and the
  class-side interface merges silently inherit those unrelated `this` types.
- **First-party-only is permanent, not provisional.** Consumers get to implement receivers and
  inherit every augmentation automatically; they don't get to mint new ones. Don't build tooling
  that assumes this opens up later.
- **A few members stay standalone-only, forever, and for two different reasons.** Where an
  augmentation's natural name collides with a primitive the interface already defines with a
  genuinely different calling convention (`log`/`beginScope` on `ILogger`, `createLogger` on
  `ILoggerFactory`), the augmented form is still dot-callable at runtime via a merge strategy, just
  not a typed overload — the typed call path stays the plain namespace function. Where mounting the
  member would make it recurse into itself (`set` on `IDistributedCache`, whose wrapper re-enters
  the receiver's own `set` in primitive shape), it's excluded from the install entirely and reached
  only as `Namespace.member.call(receiver, ...)`.
- **A duplicated signature and a merge strategy answer two different questions.** A duplicated
  signature (step 4) is for a name two contributors both declare where the shapes DO unify into
  overloads — the runtime side already works via the registry; only the interface-typed _type_
  needs the duplicate to see every overload. A merge strategy is for a name that's already taken on
  the receiver's prototype — its own hand-written primitive, or an earlier registration — where the
  runtime dispatcher has to decide which implementation a given call reaches. `Manifest.add` needs
  the strategy and no duplicate: a lone descriptor routes to the primitive, every other shape to the
  sugar.
- **The extends-merge (`export interface X extends I {}`) is per-class, not automatic.** Forget it
  on a concrete implementer and instances still get every augmentation at runtime — they're just
  invisible on that class's own type until you widen to the interface.
- **Collision is genuinely blind — there's no way to pre-approve a collision** short of supplying a
  merge strategy. Two unrelated augmentations landing on the same member name will throw at install
  time; there's no "these two are known-fine" escape hatch.
- **Import-order independence applies once a module is imported, not before.** A registration or a
  decoration can happen in either order and any number of times — but an augmentation module that's
  never imported never registers. "Is this augmentation live" is still an import-graph question;
  only the _ordering_ within the import graph stops mattering.
