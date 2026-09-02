# `@rhombus-std/primitives`

Universal, zero-dependency leaf every family can depend on: the `Type` node space every address in
the system is spelled in, the change-token trio (`IChangeToken`, `ChangeToken.onChange`,
`CompositeChangeToken`) underpinning live-reload, the augmentation infrastructure
(`registerAugmentations`, `@augment`, `applyAugmentations`, `AugmentationSet<R>` — see
`docs/features/augmentations.md`), and the structural platform typings (`AbortSignal`,
`AbortController`, `ProcessLike`, `TimeoutHandle`, `ReadableStream<R>`, `URL`) that keep the library
tier free of `lib.dom`/`@types/node`/bun-types. `primitives.extras` is the authoring surface on top
of it: `typefor<T>()` and `schemaof<T>()`, resolved at compile time.

## `Type`

A `Type` is an interned node: every factory canonicalizes what it builds, so two spellings of the
same type are one object and `===` is the whole equality test.

```ts
Type.imported('IClock', 'app') === Type.imported('IClock', 'app'); // true
Type.union(a, b) === Type.union(b, a); // true — members are sorted, deduped, flattened
```

The kinds: `imported` and `global` names, a `generic` hole, a `tag` wearing a key, `ctor` /
`abstract-ctor` / `func` callables, `array` and `iterable` lists, `tuple`, `object`, `union`,
`intersection`, and a `literal` value. Every kind has a factory under `Type`, and the factories are
where meaning lives — a rest-only tuple collapses to the list its open length draws from, a literal
standing beside its own primitive base drops out of a union, `Array<E>` lands on the array node
whichever way it is spelled.

```ts
Type.tuple({ members: [], rest: Type.global('string') }) === Type.array(Type.global('string')); // true
Type.global('Array', [Type.global('string')]) === Type.array(Type.global('string')); // true
```

`Type.from(token)` reads a type token string back into its node, and `Type.stringify(type)` writes
one; they are exact inverses, and the grammar is `docs/features/type-token-format.md`. `Type.from`
takes a string only. The parser reads the token literally into a plain tree, and `Type.adopt` brings
that tree in through the factories, so a token is canonicalized exactly as a hand-built node is.
Plain data — a tree revived from JSON, one a cast produced — enters through `Type.adopt` directly.

```ts
Type.from('app:IClock') === Type.imported('IClock', 'app'); // true
Type.adopt({ kind: 'imported', name: 'IClock', from: 'app', genericArgs: [] }); // the same node
```

A callable's signatures are one slot: a tuple row for a fixed argument list (open-length when it
carries a rest slot), a list row for a signature that is entirely a rest, or a union of rows for
several overloads. `Type.signatures(rows)` builds the slot and `Type.signatureRows(slot)` reads it
back; the callable factories take either the slot or one array of arg types per overload.

```ts
Type.ctor(instance, [[a, b], []]); // new (a, b) => instance, and new () => instance
Type.func(returns, Type.signatures([Type.tuple({ members: [a], rest: b })])); // (a, ...b[]) => returns
```

The operations: `Type.isOpen` / `Type.isClosed` (does a generic hole remain), `Type.bindGenerics`
(does some closing of a pattern equal a candidate, and with which bindings), `Type.isMatch`,
`Type.substitute` (fill named holes), `Type.isPromiseLike` / `Type.awaited` / `Type.promise`,
`Type.isOptional` (does the type admit `undefined`), and `Type.Visitor`, the dispatch base every
walk over the node space subclasses.

```ts
const [matched, generics] = Type.bindGenerics(typefor<Promise<Generic<'S'>>>(), type);
// matched: is `type` a Promise<…>; generics.S: what it carries
```

A malformed token is a `TypeParseError` naming the offset and what the reader expected there; a
well-formed token spelling a type the factories refuse is their own `TypeError`.

## Change tokens

`IChangeToken` is the contract a reload-aware consumer holds: `hasChanged`, whether callbacks are
raised proactively, and `registerChangeCallback`. `ChangeToken.onChange` keeps one consumer
subscribed across successive tokens, re-registering as each one fires; `CompositeChangeToken` merges
several into one that fires when any does; `CancellationChangeToken` wraps an `AbortSignal`.

```ts
using subscription = ChangeToken.onChange(() => source.getReloadToken(), () => reload());
```

## Augmentations

The mechanism by which a package adds dot-callable members to an interface it does not own. A
CLOSED receiver installs directly with `applyAugmentations(Ctor, set)`; an OPEN receiver registers
with `registerAugmentations(receiver, set)` and the concrete class subscribes with
`@augment(receiver)`, so registration and decoration work in either order. Full mechanics:
`docs/features/augmentations.md`.

```ts
@augment(typefor<IServiceProvider>())
export class ServiceProvider implements IServiceProvider { … }
```

## Also here

`ImmutableLinkedList` (a list whose every extension shares what was already there, readable from
either end) and
`NotImplementedError` (a member declared so callers can be written against it, which has no
behaviour yet). The package stamps itself at load, so a second loaded copy fails fast rather than
forking the intern table and the augmentation registry — every bundle keeps it external.

## `primitives.extras`

The compile-time verbs. `typefor<T>()` names a type — the `Type` a spelling reads back as — and
`typefor(value)` observes a value's own constructor or call signatures; `schemaof<T>()` opens a type
up into the `Type.object` of its members. Each is resolved at compile time, and calling one without
that resolution throws. `registerAugmentations<R>(set)` is the receiver-as-type-argument form of the
registry call. The brands are type-only: `Generic<'L'>` stands for a hole a pattern has not been
closed against, `T` is the conventional one-hole spelling, and `Keyed<T, 'k'>` pins a key into a
type, deriving as that type wearing the tag.

```ts
typefor<IClock>(); // Type.imported('IClock', 'app')
typefor(SqlClock).instance; // the instance the class builds, not the constructor
typefor<Keyed<IClock, 'wall'>>(); // Type.tag(Type.imported('IClock', 'app'), 'wall')
schemaof<ServerConfig>(); // Type.object({ host: Type.global('string'), … })
```
