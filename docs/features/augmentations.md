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

Write the member map as a `type` literal by default — a type literal carries the implicit index
signature that `AugmentationSet2`'s `Record<PropertyKey, Func>` constraint needs, so it plugs in
directly. The one reason to use an `interface` instead is `this`-polymorphic returns
(`addFilter(...): this`), which are only legal inside an interface; an interface has no implicit
index signature, so wrap it as `Flatten<IMemberMap>` wherever the constraint is applied (the
`AugmentationSet2` const annotation), while the `extends` merge in step 3 uses the raw interface so
`this` keeps meaning the receiver.

**3. Merge the member map onto the receiver interface with `extends`**, in the same file as the
receiver's own declaring module (this placement matters — see Gotchas):

```ts
declare module '@rhombus-std/config.core' {
  interface IConfigBuilder extends IConfigBuilderJsonAugmentations {}
}
```

The `declare module` target is always the receiver's **package specifier** — never a relative
path. A relative target (`declare module './configuration-builder.js'`) merges onto one internal
module instance: consumers resolving the receiver through the package barrel never see the merge,
and the rolled `.d.ts` cannot represent it. The bare specifier merges onto the package's public
surface, survives file moves, and rolls correctly. A receiver in your own package is no exception —
target your own package's name.

A receiver with its own generic parameter threads it through both the member map and this merge:
`IManifestServiceAugmentations<Scopes extends string>` merges onto
`interface IManifest<Scopes extends string> extends IManifestServiceAugmentations<Scopes> {}`.

**A member name that another package also contributes to the same receiver duplicates its
signature directly in the `declare module` body, beside the `extends` clause.** Two `extends`
clauses supplying one name do not fold into overloads: TypeScript's declaration merging treats a
directly-declared member as shadowing one reached only through `extends`, so when neither side
declares the colliding name directly, only one of them survives on the interface-typed receiver —
the other, though still installed at runtime, is invisible to a caller holding the interface type.
The same shadowing hits a member whose other side is the receiver's own primary declaration.

```ts
// package-a's Receiver-Greet-augmentations.ts
type IReceiverGreetAugmentations = { hello(world: number): void; };
declare module 'receiver-package' {
  interface Receiver extends IReceiverGreetAugmentations {}
}
```

```ts
// package-b's Receiver-Farewell-augmentations.ts, contributing the SAME name
type IReceiverFarewellAugmentations = { hello(farewell: string): void; };
declare module 'receiver-package' {
  interface Receiver extends IReceiverFarewellAugmentations {}
}
```

Only one `hello` overload is visible on an interface-typed `Receiver` here. Each side names its
own duplicate, verbatim and undocumented (the member map keeps the documented declaration), inside
its own block:

```ts
declare module 'receiver-package' {
  interface Receiver extends IReceiverGreetAugmentations {
    hello(world: number): void;
  }
}
```

```ts
declare module 'receiver-package' {
  interface Receiver extends IReceiverFarewellAugmentations {
    hello(farewell: string): void;
  }
}
```

With both sides declaring their own signature directly, TypeScript's ordinary same-name-across-
partial-declarations merge — the same one that already applies between a receiver's primary
declaration and its augmentations — folds them into one overload list, and the interface-typed
receiver sees every form. A member whose name never collides keeps its `extends`-only empty body.

**4. Write the exported const and install it:**

- **OPEN receiver** — type the const `AugmentationSet2<Receiver, MemberMap>`. `AugmentationSet2` is
  a mapped type over the member map from step 2: it types `this` as the receiver in every member
  and carries every parameter and return type along, so the object literal itself needs no type
  annotations at all — each member is written as a plain method whose `this` is the receiver:

  ```ts
  import { type AugmentationSet2, registerAugmentations } from '@rhombus-std/primitives';
  import { tokenfor } from '@rhombus-std/primitives.extras';

  export const ConfigBuilderJsonAugmentations: AugmentationSet2<IConfigBuilder, IConfigBuilderJsonAugmentations> = {
    addJsonFile(path, optional) {
      return this.add(new JsonConfigSource(path, optional));
    },
  };

  registerAugmentations(tokenfor<IConfigBuilder>(), ConfigBuilderJsonAugmentations);
  ```

  Any class decorated `@augment(tokenfor<IConfigBuilder>())` — anywhere, imported in any order,
  defined before or after this call runs — picks the new member up automatically.

- **CLOSED receiver** — call `applyAugmentations(ConcreteClass, TheConst)` directly, wherever the
  concrete class is defined. `applyAugmentations` still takes a plain object literal `satisfies
  AugmentationSet<Receiver>` rather than an `AugmentationSet2`-typed one, so its members keep their
  hand-written parameter types (`this` is contextually the receiver in both forms); only the
  interface merge in step 3 is shared with the OPEN case:

  ```ts
  export const MemoryCacheSugarAugmentations = {
    getOrCreate(key: string, factory: () => unknown) {
      return this.tryGetValue(key) ?? factory();
    },
  } satisfies AugmentationSet<IMemoryCache>;

  applyAugmentations(MemoryCache, MemoryCacheSugarAugmentations);
  ```

This const **is** the callable surface either way — with no installation step,
`ConfigBuilderJsonAugmentations.addJsonFile.call(builder, path)` already works, the way any
extracted method is called on an explicit receiver. Installation is what additionally makes
`builder.addJsonFile(path)` work.

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
(`Manifest` in di2.core is the canonical in-repo example of this shape.)

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

- **No** → assign the authored method itself (`proto[n] = fn`) — the installed member IS the set's
  member, so function identity holds, and re-installing the very same function is a silent no-op.
- **Yes, and a merge strategy was supplied for `n`** → mount a dispatcher that chains the new
  implementation over whatever was already there (both arms are `this`-based; the dispatcher
  forwards with `fn.call(this, ...args)`).
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
  the class-side interface merges silently inherit those unrelated `this` types.
- **First-party-only is permanent, not provisional.** Consumers get to implement receivers and
  inherit every augmentation automatically; they don't get to mint new ones. Don't build tooling
  that assumes this opens up later.
- **A few members stay standalone-only, forever.** Where an augmentation's natural name collides
  with a primitive the interface already defines with a genuinely different calling convention
  (`log`/`beginScope` on `ILogger`, `tryGetValue` on `IMemoryCache`, `createLogger` on
  `ILoggerFactory`, `build` on `di`), the augmented form is dot-callable at runtime via a merge
  strategy but isn't a typed overload (TS can't unify the two call shapes). The _typed_ call path
  for these stays the plain standalone function, not the method form.
- **A merge strategy and a duplicated signature answer two different questions.** A merge strategy
  (above) is for a name that's already taken by the receiver's own hand-written primitive, with a
  genuinely incompatible call shape — the runtime dispatcher picks which implementation a call
  reaches. A duplicated signature (step 3) is for a name two `extends`-only augmentations both
  contribute — the runtime side already works via the registry; only the interface-typed _type_
  needs the duplicate to see every overload.
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
