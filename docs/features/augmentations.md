# Augmentations

@rhombus-std ports reference libraries into TypeScript, a structurally-typed language with no
native notion of "add a method to a type after the fact." C# has exactly this feature — extension
methods — and large parts of the reference API surface are built on it. This doc describes the
mechanism we built to reproduce that behavior in TypeScript: the behavior we're trying to observe,
how to author one, how to consume one, how it actually works, and what to watch out for.

## The behavior we're reproducing

C# lets you declare a **static method that behaves like an instance member of an interface it
doesn't own**:

```csharp
public static class JsonConfigExtensions
{
    public static IConfigBuilder AddJsonFile(this IConfigBuilder builder, string path)
    {
        return builder.Add(new JsonConfigSource(path));
    }
}
```

Once this exists, `builder.AddJsonFile("appsettings.json")` compiles for **every** value statically
known as an `IConfigBuilder` — a concrete class that implements it, a subinterface of it, an
interface-typed variable or field, a generic type parameter constrained to it. Nobody who writes a
new `IConfigBuilder` implementation has to do anything for `AddJsonFile` to show up on it;
the dispatch is **nominal** (by declared interface identity), not structural, and it is resolved at
compile time against the interface, never against a concrete type's name or shape.

That's the target behavior. TypeScript has no extension-method syntax and its type system is
structural rather than nominal, so we can't lean on the language feature directly — we have to
build the equivalent ourselves:

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
load after its concrete class already exists (`ServiceManifest`, `IConfigBuilder`,
`ILoggingBuilder`, `IMetricsBuilder`, `ITracingBuilder`, `IHost`, `IHostBuilder`,
`IHostEnvironment`) — these need the token registry (see below). A receiver is **CLOSED** if the
interface and every one of its augmentations live inside one family's own package (`IMemoryCache`,
`MetricsOptions`, `LoggerFilterOptions`) — these install directly, no token needed.

**2. Name the file `<Receiver>-<Topic>-augmentations.ts`**, where `Receiver` is the receiver
interface's name with its leading `I` dropped and `Topic` is a short word for the member group
(`Json`, `Descriptor`, `Service`). Declare the member map as its own named type — the signatures a
caller sees on the receiver, with the receiver itself omitted:

```ts
type IConfigBuilderJsonAugmentations = {
  addJsonFile(path: string, optional?: boolean): IConfigBuilder;
};
```

This type is the one place the member signatures are written — everything else below either
`extends` it or derives from it.

**3. Merge the member map onto the receiver interface with `extends`**, in the same file as the
receiver's own declaring module (this placement matters — see Gotchas):

```ts
declare module './configuration-builder.js' {
  interface IConfigBuilder extends IConfigBuilderJsonAugmentations {}
}
```

A receiver with its own generic parameter threads it through both the member map and this merge:
`IManifestServiceAugmentations<Scopes extends string>` merges onto
`interface IManifest<Scopes extends string> extends IManifestServiceAugmentations<Scopes> {}`.

**4. Write the exported const and install it:**

- **OPEN receiver** — type the const `AugmentationSet2<Receiver, MemberMap>`. `AugmentationSet2` is
  a mapped type over the member map from step 2: it adds the leading `receiver` parameter to every
  member and carries every other parameter and return type along, so the object literal itself
  needs no type annotations at all:

  ```ts
  import { type AugmentationSet2, registerAugmentations } from '@rhombus-std/primitives';
  import { tokenfor } from '@rhombus-std/primitives.extras';

  export const ConfigBuilderJsonAugmentations: AugmentationSet2<IConfigBuilder, IConfigBuilderJsonAugmentations> = {
    addJsonFile(builder, path, optional) {
      return builder.add(new JsonConfigSource(path, optional));
    },
  };

  registerAugmentations(tokenfor<IConfigBuilder>(), ConfigBuilderJsonAugmentations);
  ```

  Any class decorated `@augment(tokenfor<IConfigBuilder>())` — anywhere, imported in any order,
  defined before or after this call runs — picks the new member up automatically.

- **CLOSED receiver** — call `applyAugmentations(ConcreteClass, TheConst)` directly, wherever the
  concrete class is defined. `applyAugmentations` still takes a plain object literal `satisfies
  AugmentationSet<Receiver>` rather than an `AugmentationSet2`-typed one, so its members keep their
  hand-written parameter types; only the interface merge in step 3 is shared with the OPEN case:

  ```ts
  export const MemoryCacheSugarAugmentations = {
    getOrCreate(cache: IMemoryCache, key: string, factory: () => unknown) {
      return cache.tryGetValue(key) ?? factory();
    },
  } satisfies AugmentationSet<IMemoryCache>;

  applyAugmentations(MemoryCache, MemoryCacheSugarAugmentations);
  ```

This const **is** the callable surface either way — `ConfigBuilderJsonAugmentations.addJsonFile(builder, path)`
already works, with no installation step, as a plain function. Installation is what additionally
makes `builder.addJsonFile(path)` work.

**Naming at a glance** — the file, the member-map type, and the const all share the same
`Receiver`/`Topic` pair:

|                 | pattern                               | example                               |
| --------------- | ------------------------------------- | ------------------------------------- |
| file            | `<Receiver>-<Topic>-augmentations.ts` | `ConfigBuilder-Json-augmentations.ts` |
| member-map type | `I<Receiver><Topic>Augmentations`     | `IConfigBuilderJsonAugmentations`     |
| const           | `<Receiver><Topic>Augmentations`      | `ConfigBuilderJsonAugmentations`      |

**Legacy shape.** Some augmentation files still declare their members inline inside the `declare
module` block and type the const `satisfies AugmentationSet<Receiver>` with no separate member-map
type at all, with a run-on PascalCase file name instead of the hyphenated `Receiver-Topic` form —
for example `libraries/di.core/src/augmentations/ServiceManifestDescriptorAugmentations.ts`. That's
the pre-member-map shape; every new augmentation uses the steps above, and existing files migrate to
it opportunistically rather than through a dedicated rewrite pass.

## Implementing an augmented interface (the supported consumer feature)

This is the half of the story open to everyone, first-party or downstream: implement a receiver
interface and get its full augmentation surface for free, automatically, forever (including
augmentations registered _after_ your class is defined).

**1. Implement the interface normally:**

```ts
export class MyConfigurationBuilder implements IConfigBuilder {
  add(source: IConfigSource): IConfigBuilder {/* ... */}
  build(): IConfig {/* ... */}
}
```

**2. Decorate the class with `@augment`, using the same token the augmentations were registered
under:**

```ts
@augment(tokenfor<IConfigBuilder>())
export class MyConfigurationBuilder implements IConfigBuilder {
  add(source: IConfigSource): IConfigBuilder {/* ... */}
  build(): IConfig {/* ... */}
}
```

**3. Add an empty extends-merge so the type-checker sees the augmented members as part of the
class's own type**, not just the bare interface's:

```ts
export interface MyConfigurationBuilder extends IConfigBuilder {}
```

Without this step, callers holding a `MyConfigurationBuilder`-typed reference (rather than an
`IConfigBuilder`-typed one) won't see the augmented members in their type, even though the
class still satisfies `implements IConfigBuilder`. The extends-merge closes that gap.

That's it. Every augmentation on that token — the ones that existed when you wrote this class, and
every one registered on it afterward, by any package — now shows up as a real, typed, callable
method on instances, with zero further action on your part.

## How we pulled it off

**The registry.** A module-level `Map<Token, Bag>` lives in `@rhombus-std/primitives` (the
universal zero-dep leaf every family can already reach). `Bag` is a `Multimap<string, [fn,
mergeStrategy?]>` — a per-member-name list of contributions, each pairing its function with its own
collision strategy.

**Registering.** `registerAugmentations(token, set, merge?)` appends `set`'s members into the
token's bag, then synchronously drives just those new members onto every class already subscribed
to that token. A second registration of the same member name under a different set does not throw
here — it just accumulates; the throw (if any) happens at install time, per class.

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

- **No** → mount a `this`-forwarding thunk that calls the augmentation function receiver-first.
- **Yes, and a merge strategy was supplied for `n`** → mount a dispatcher that chains the new
  implementation over whatever was already there.
- **Yes, and no merge strategy** → **throw**, immediately, naming the class and the member. Never
  silently clobber.

No token, receiver, or "where did this come from" identity is ever consulted — purely "is this slot
taken." That's what lets an augmentation share a name with a class's own hand-written primitive
(`ILogger.log`/`beginScope`, `IMemoryCache.tryGetValue`, `di`'s `build`) via an explicit merge
strategy, while two unrelated augmentations that happen to collide by name fail loud instead of one
quietly overwriting the other.

**Tokens are values, not names.** `Token` (defined in `primitives`, re-exported by `di.core`) is
derived inline at every call site via `tokenfor<Receiver>()` — there are no exported token constants.
A transformer lowers `tokenfor<IConfigBuilder>()` to the literal string
`"@rhombus-std/config:IConfigBuilder"`; a hand-written, no-transformer caller just writes
that string directly. Two calls naming the same interface always produce the same token, regardless
of which package or file they're in.

**The transformer closes the sugar-forms gap.** Convenience forms like `add<T>()` or
`addOptions<T>()` need to know, at compile time, which receiver interface a call target belongs to
— exactly the question C#'s compiler answers by resolving overload sets against declared interface
membership. Our transformer answers it the same way: it resolves the called member's **symbol**
back to its declaration, and accepts the call only if that declaration sits on the receiver
interface, inside that interface's own `declare module` block — never by matching the receiver's
type _name_, and never by call _shape_ alone. This is what makes a concrete implementer, a
subinterface, an interface-typed reference, and a generic constrained to the interface **all**
resolve correctly (matching C#'s dispatch surface exactly), while a structurally-identical-but-
unrelated type (say, a class that happens to also have an `add` method) never false-positives — it
was never a declaration on that interface, so it was never a candidate.

**Runtime identity is load-bearing.** Every package that bundles must keep `@rhombus-std/primitives`
**external**. An inlined copy of `primitives` forks the registry's `Map` and subscriber list into
two independent instances that never see each other — a class decorated against one copy of the
registry never receives augmentations registered against the other.

## Gotchas

- **OPEN vs CLOSED is a one-time call per receiver, not a spectrum.** Get it backwards and you
  either build registry plumbing a receiver never needed, or — the bug that motivated the registry
  in the first place — a legitimate downstream extender has no path to reach a concrete class it's
  never heard of (an independent builder never receiving an augmentation meant for it).
- **Merge-identity rule.** Every interface-side `declare module` merge for _one_ interface must
  resolve to the interface's own declaring module — same file, any specifier. Mixing a
  package-barrel specifier with a relative/declaring-module specifier for the _same_ interface
  makes TS treat the accumulated `this`-returning members as having unrelated `this` types, and
  concrete classes silently stop satisfying `implements`.
- **First-party-only is permanent, not provisional.** Consumers get to implement receivers and
  inherit every augmentation automatically; they don't get to mint new ones. Don't build tooling
  that assumes this opens up later.
- **A few members stay standalone-only, forever.** Where an augmentation's natural name collides
  with a primitive the interface already defines with a genuinely different calling convention
  (`log`/`beginScope` on `ILogger`, `tryGetValue` on `IMemoryCache`, `createLogger` on
  `ILoggerFactory`, `build` on `di`), the augmented form is dot-callable at runtime via a merge
  strategy but isn't a typed overload (TS can't unify the two call shapes). The _typed_ call path
  for these stays the plain standalone function, not the method form.
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
