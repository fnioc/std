# `@rhombus-std/primitives`

Types you can compare with `===`. Every `Type` node is interned, so two spellings of the same type —
built by hand, derived by `typefor<T>()`, or read back from a token string — are one object, and a
type can be a `Map` key, a registry key, or a service address with no equality helper anywhere.
That is the foundation everything above it stands on: the container's addresses, the augmentation
registry's receivers, and the type tokens that travel through config and logs are all the same
nodes. Beside it, the zero-dependency leaf carries the change-token trio (`IChangeToken`,
`ChangeToken.onChange`, `CompositeChangeToken`) underpinning live-reload, the augmentation
infrastructure that lets a package add dot-callable members to an interface it does not own
(`registerAugmentations`, `@augment`, `applyAugmentations`, `AugmentationSet<R>` — see
`docs/features/augmentations.md`), and the structural platform typings (`AbortSignal`,
`AbortController`, `ProcessLike`, `TimeoutHandle`, `ReadableStream<R>`, `URL`) that keep the library
tier free of `lib.dom`, `@types/node` and bun-types. `primitives.extras` is the authoring surface on
top: `typefor<T>()` and `schemaof<T>()`, resolved at compile time so no address is ever spelled by
hand.

## `Type`

Identity is the whole equality test. Every factory canonicalizes what it builds — members sorted,
deduped and flattened, a literal beside its own primitive base dropped — so the reading TypeScript
gives a type is the reading you get:

```ts
Type.imported('IClock', 'app') === Type.imported('IClock', 'app'); // true
Type.union(a, b) === Type.union(b, a); // true
Type.union(Type.global('string'), Type.typeLiteral('fast')) === Type.global('string'); // true
```

The kinds: `imported` and `global` names, a `generic` hole, a `tag` wearing a key, `ctor` /
`abstract-ctor` / `func` callables, `array` and `iterable` lists, `tuple`, `object`, `union`,
`intersection`, and a `literal` value. Every kind has a factory under `Type`, and the factories are
where meaning lives — a rest-only tuple collapses to the list its open length draws from, and
`Array<E>` lands on the array node whichever way it is spelled:

```ts
Type.tuple({ members: [], rest: Type.global('string') }) === Type.array(Type.global('string')); // true
Type.global('Array', [Type.global('string')]) === Type.array(Type.global('string')); // true
```

Types travel as strings and come back as the same node. `Type.stringify(type)` writes a type token
and `Type.from(token)` reads one; they are exact inverses, and the grammar is
`docs/features/type-token-format.md`. `Type.from` takes a string only: the parser reads the token
literally into a plain tree, and `Type.adopt` brings that tree in through the factories, so a token
is canonicalized exactly as a hand-built node is. Plain data — a tree revived from JSON, one a cast
produced — enters through `Type.adopt` directly.

```ts
Type.from('app:IClock') === Type.imported('IClock', 'app'); // true
Type.adopt({ kind: 'imported', name: 'IClock', from: 'app', genericArgs: [] }); // the same node
```

A type spells itself wherever text is expected, so an error message or a log line interpolates the
node and gets its token — and so does a failed assertion, which prints the token rather than the
tree.

```ts
throw new Error(`cannot satisfy ${type}`); // cannot satisfy app:IClock
[a, b].join(' -> '); // app:A -> app:B
```

In JSON a type is its tree rather than its token: `JSON.stringify(type)` emits exactly the fields
the node carries. A document that is one type reads back through `Type.adopt`; for types embedded
anywhere inside a larger document, hand `Type.reviver` to `JSON.parse` and each one arrives as the
node it names.

```ts
Type.adopt(JSON.parse(text)) === type; // a document that is one type
JSON.parse(text, Type.reviver); // types anywhere inside one
```

A callable's signatures are one slot, so overloads are data you can read and match on: a tuple row
for a fixed argument list (open-length when it carries a rest slot), a list row for a signature that
is entirely a rest, or a union of rows for several overloads. `Type.signatures(rows)` builds the
slot, `Type.signatureRows(slot)` reads it back, and the callable factories take either the slot or
one array of arg types per overload.

```ts
Type.ctor(instance, [[a, b], []]); // new (a, b) => instance, and new () => instance
Type.func(returns, Type.signatures([Type.tuple({ members: [a], rest: b })])); // (a, ...b[]) => returns
```

Pattern matching over types with holes is built in. `Type.extractMatchedGenerics(pattern, candidate)` answers
whether some closing of the pattern equals the candidate and hands back the bindings; `Type.isMatch`
is its boolean form, `Type.substitute` fills named holes, `Type.isOpen` / `Type.isClosed` say whether
a hole remains. `Type.isPromise` / `Type.awaited` / `Type.promise` read and build the one
deferred-delivery spelling, `Type.isOptional` asks whether a type admits `undefined`, and
`Type.Visitor` is the dispatch base every walk over the node space subclasses.

```ts
const [matched, generics] = Type.extractMatchedGenerics(typefor<Promise<Generic<'S'>>>(), type);
// matched: is `type` a Promise<…>; generics.S: what it carries
```

A malformed token is a `TypeParseError` pointing at the offset and what the reader expected there; a
well-formed token spelling a type the factories refuse is their own `TypeError`.

## Change tokens

Live reload without a framework. `IChangeToken` is the contract a reload-aware consumer holds:
`hasChanged`, whether callbacks are raised proactively, and `registerChangeCallback`.
`ChangeToken.onChange` keeps one consumer subscribed across successive tokens, re-registering as each
one fires, and hands back a `Disposable` so a `using` block is the whole lifecycle;
`CompositeChangeToken` merges several into one that fires when any does; `CancellationChangeToken`
wraps an `AbortSignal`.

```ts
using subscription = ChangeToken.onChange(() => source.getReloadToken(), () => reload());
```

## Augmentations

Add members to an interface you do not own, dot-callable on every value of it, with no wrapper type
and no patching of the declaring package. A CLOSED receiver installs directly with
`applyAugmentations(Ctor, set)`; an OPEN receiver registers with `registerAugmentations(receiver,
set)` and the concrete class subscribes with `@augment(receiver)`, so registration and decoration
work in either order and any number of times. Full mechanics: `docs/features/augmentations.md`.

```ts
@augment(typefor<IServiceProvider>())
export class ServiceProvider implements IServiceProvider { … }
```

## Also here

`NotImplementedError` (a member declared so callers can be written against it, which has no
behaviour yet). The package stamps itself at load, so a second loaded copy fails fast rather
than forking the intern table and the augmentation registry — every bundle keeps it external, and
identity holds across your whole dependency graph.

## `primitives.extras`

Never spell an address by hand. `typefor<T>()` names a type — the `Type` a spelling reads back as —
and `typefor(value)` observes a value's own constructor or call signatures; `schemaof<T>()` opens a
type up into the `Type.object` of its members. Each is resolved at compile time, and calling one
without that resolution throws. `registerAugmentations<R>(set)` is the receiver-as-type-argument form
of the registry call. The brands are type-only and erase: `Generic<'L'>` stands for a hole a pattern
has not been closed against, `T` is the conventional one-hole spelling, and `Keyed<T, 'k'>` pins a
key into a type, deriving as that type wearing the tag.

```ts
typefor<IClock>(); // Type.imported('IClock', 'app')
typefor(SqlClock).instance; // the instance the class builds, not the constructor
typefor<Keyed<IClock, 'wall'>>(); // Type.tag(Type.imported('IClock', 'app'), 'wall')
schemaof<ServerConfig>(); // Type.object({ host: Type.global('string'), … })
```
