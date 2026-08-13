# Construct-on-miss for constructor types

A design proposal for the owner. Nothing here is implemented; the recommendation and the decision
points at the end are what need a ruling.

## The question, and the split inside it

`decisions.user.md` U4 rules resolution as lookup, then construct on a miss:

> Every non-identifier `Type` can also serve as a spec: when no registration answers, the container
> constructs it by composing looked-up leaves; a pure reference misses instead.

`CtorType` is a non-identifier, so a request for `Ctor<Foo, Bar>` that no registration answers must
construct rather than fail. It fails today.

But "construct" has two readings, and the two documents read it differently. U4 says _compose
looked-up leaves_ — which for a call-shape node means composing a callable out of the lookup, the
way `FuncType` already does. `di2.requirements.md` (Container door semantics) says something else:

> Requesting an UNREGISTERED constructor is construct-on-miss of a `CtorType`: di instantiates it,
> resolving its parameter types through the lookup.

Those are two different features:

- **The deferred maker.** `Ctor<Foo, Bar>` resolves to something you `new` with a `Bar` and get a
  `Foo` — the `Foo` coming from the lookup, the `Bar` from the caller. Composed entirely out of the
  node and the registry. Needs nothing the engine does not already have.
- **The activator.** `Ctor<Foo, Bar>` resolves to a `Foo`, built by calling `Foo`'s own constructor
  with a looked-up `Bar` — where `Foo` is a class nobody registered. Needs the class itself.

Only the second is blocked, and it is blocked on something no amount of node design dissolves. The
rest of this document is mostly about that.

## Where the engine stands

Every spec kind that has an arm builds its answer out of the node and the registry alone.
`ToCallSiteVisitor` is the whole of it:

| Kind                                 | What a miss synthesizes                                                                                        |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `named`, `tag`, `generic`            | nothing — the address-only kinds, plus `generic` having no request to close it                                 |
| `literal`                            | the value it carries, as a constant                                                                            |
| `tuple`                              | a factory that realizes each member into a fresh array                                                         |
| `func`                               | a late-bound closure — the return looked up per call, the arguments bound to it                                |
| `array`, `iterable`, `asyncIterable` | the collection of every way to produce the element                                                             |
| `async`                              | nothing — parked with the async realize design                                                                 |
| `intersection`                       | nothing — only one registration can be every member at once, and the whole-type lookup already searched for it |
| `object`                             | nothing                                                                                                        |
| `ctor`                               | nothing                                                                                                        |

The one arm that reaches outside both node and registry is `named`'s: the `IServiceProvider`
spelling resolves to the provider itself, a value the engine holds in hand.

The aggregate rule is the closest landed precedent for what construct-on-miss looks like. An
aggregate address is answered by lookup first, and only a miss synthesizes; the synthesized
collection is assembled in `#collection`, where the synthesized member leads and the registrations
follow in registration order:

```ts
#collection(itemType: Type): CallSite[] {
  const registered = [...this.#candidates(itemType)].reverse();
  const synthesized = this.#synthesized(itemType);
  return synthesized ? [synthesized, ...registered] : registered;
}
```

`#synthesized` calls `super.visit`, which is the per-kind synthesis with the registry lookup
deliberately skipped — registration hits are the other category and must not be counted twice. So
"synthesis is the weakest answer, reached only when nothing is registered" is already the shape of
the code, and a ctor arm slots into it without inventing a rule.

## The obstacle

`Type.ctor` interns on the identity of its children and nothing else:

```ts
export function ctor(instanceType: Type, args: readonly Type[]): CtorType {
  const instance = adopt(instanceType);
  const slots = args.map(adopt);
  return intern(
    `ctor\0${id(instance)}\0${slots.map(id).join(',')}`,
    () => node<CtorType>({ kind: 'ctor', args: slots, instanceType: instance }),
  );
}
```

`instanceType` is a `NamedType` — a name and a module specifier. There is no class in it, and no
walk over it produces one. `new` needs a function value; a description of a function is not one.

Every other spec kind escapes this because its answer is derivable: a literal's answer is the value
it already carries, a tuple's is its realized members, an aggregate's is its registrations, a
function type's is a closure over the lookup. A constructor type's answer is a class, and a class is
a value that only its own module has.

Where values legitimately enter today is worth reading off the registration surface, because the
answer is uniform: **the value travels beside the description, never inside it.**

```ts
export type DescribeArgs<Scopes extends string> =
  | [configure: Func<[Unstarted<any, Scopes>], IComplete>]
  | [impl: Ctor | Func, implType: Type, scope?: Scopes, key?: string];
```

`impl` is the class; `implType` describes its call shape. `CtorServiceDescriptor` keeps the same
separation — `ctor: Ctor` beside `signatures: ReadonlyArray<readonly Type[]>`. Metadata stays pure
because the value rides alongside it.

The resolution door has no alongside. `getService(type: Type | Token)` takes a description and
nothing else, so a request cannot carry a class without one of the design space's options below
changing what a request is.

## The design space

### A. The node carries the class

A node kind whose identity includes a class value — `Type.class(FooClass, ...args)`, interned on the
class's reference identity plus its argument nodes. The engine's arm is then trivial: read the class
off the node, lower the arguments, emit the existing `CtorCallSite`.

There is a precedent for a value on a node: `TypeLiteralType` carries `value` and self-supplies
through `CallSite.constant`. But the precedent breaks exactly where it would have to hold. A
literal's value has structural identity, so `literalKey` derives the intern key from the value
itself and interning stays a pure function of the spelling. A class has only reference identity, so
the key has to reach into a side counter — the `ids` WeakMap pattern, applied to classes.

What that costs:

- **The round trip stops holding.** `Type.from` is documented as the inverse of `Type.stringify`,
  and no token can name a class. A class-carrying node either has no spelling or has one that reads
  back as a different node.
- **The intern table retains every class forever.** `table` is a strong `Map`, so a node holding a
  class pins it. Immaterial for module-level classes, but it is a new retention edge in a table
  whose current contents are pure data.
- **Four visitors gain an arm each** (stringify, validate, match, substitute) for a node whose
  answers there are mostly "this is meaningless".
- **The derivation has to emit a value reference.** `typefor<Foo>()` derives a description from a
  type; emitting the class binding requires deciding, at transform time, whether `Foo` names a class
  in value space. When it does not — an interface, a type alias — there is no fallback that keeps
  the same node kind. That is a new derivation capability with a failure mode, and the constraint
  it enforces is not expressible in a declaration.

Interning survives intact — the node is still frozen, still immutable, still one identity per
spelling. It is the spelling that stops being a total function.

### B. A deposit table keyed by the interned node

A `Map<Type, Ctor>` somebody writes into — `Type.implement(node, FooClass)` at module scope, or the
derivation emitting the deposit. The engine reads it on a ctor miss.

This one should be rejected rather than weighed:

- The requirements rule side tables narrowly — a cache whose "only writer is the walk that derived
  the answer from the node itself". A deposit has no such provenance: it is written by an outside
  party about a node.
- It makes resolution depend on module import order. Whether `Ctor<Foo, Bar>` resolves would turn on
  whether the module holding the deposit had been imported yet — the same manifest answering
  differently in two programs. The interning model exists to make identity independent of who
  reached it first; this reintroduces exactly that dependence one layer up.
- Two providers in one process cannot disagree, and a second deposit for one node is either a silent
  clobber or a throw at import time.

### C. The class arrives beside its description

The activator: the container takes the class and the description as two arguments, resolves the
described arguments through the ordinary lookup, and constructs.

```ts
create<T>(impl: Ctor<any[], T>, implType: CtorType): T;
```

`provider.create(SqlRepo, Type.ctor(sqlRepoType, dbType, loggerType))` resolves `dbType` and
`loggerType` the way any dependency slot resolves, then calls `new SqlRepo(db, logger)`. `CtorType`
stays structural, interning is untouched, no visitor gains an arm, and the value rides beside the
description exactly as it does at registration.

The sugar lands cleanly on it, because the class name the caller writes is already a value binding
at the call site:

```ts
// authored
const repo = provider.create<SqlRepo>();
// lowered
const repo = provider.create(SqlRepo, Type.ctor(/* … */));
```

And the constraint that keeps it honest is in the declaration: `impl: Ctor<any[], T>` refuses a `T`
that is not constructible, at compile time, for a caller who never runs the transform. Under A that
same constraint has to be enforced inside the transform.

Its cost is the one the requirements name first: "One entrypoint: `getService(request: Type)`".
`create` is a second door. How much that costs depends on whether activation is resolution at all —
nothing is registered, nothing is cached, no lifetime applies, and the caller supplies the
implementation. It reads more like the registration surface's twin than like a second way to ask for
a service.

### D. The U4 reading — a deferred maker, no value at all

`Ctor<Foo, Bar>` synthesizes the same way `Func<Foo, Bar>` does: a callable whose result is looked
up and whose declared arguments are bound to the call.

```ts
protected override visitCtor(type: CtorType): CallSite | undefined {
  return CallSite.deferredCtor(type.instanceType, type.args);
}
```

Realization differs from `latebound` in one respect. `visitLateBound` returns an arrow function, and
arrows are not newable, so a ctor site needs a plain `function` — which is both newable and callable,
and under `new` yields the object the body returns.

```ts
protected visitDeferredCtor(site: DeferredCtorCallSite): any {
  const context = this.#context;
  return function(...args: any[]) {
    return context.engine.resolve(site.result, {
      serviceProvider: context.serviceProvider,
      additionalServices: site.args.map((type, i) => ServiceDescriptor.value(type, args[i])),
    });
  };
}
```

This closes U4's letter for `ctor` at the cost of one call-site kind and two small arms, needs no
value channel, and touches neither interning nor the derivation. What it does not do is construct an
unregistered class: the instance still comes from a registration. It is a parameterized maker for a
registered service, differing from `Func` only in call protocol.

Two consequences to weigh rather than assume:

- `getService(Ctor<…>)` would stop returning `undefined`, since a ctor request would always
  synthesize. That mirrors `func` today, deliberately, but it does remove the ability to treat a
  constructor-typed dependency as optional.
- The composed implementation node a registration carries is itself a `CtorType` with the address in
  its instance slot. Requesting one would resolve to a maker rather than missing. Harmless — nothing
  requests an impl node — but it is a new way for a typo to succeed quietly.

### The neighbouring gap: `object`

`visitObject` returns undefined too, and the composition looks obvious — resolve each member, build
the record. It is not obvious, and it should not ride along with this decision.

`ObjectType` doubles as the spelling of a structural service contract. Synthesizing it means any
request for an object-shaped contract builds a record whose function-typed members are each a
late-bound closure — a plausible-looking stand-in for a service that was never registered.
`getService` of any structural contract would stop returning `undefined`. That is a wide behavioural
change dressed as a one-line arm, and it deserves its own ruling.

## Failure semantics

Nothing here needs a new error type, and the taxonomy is deliberately small enough that adding one
should be resisted.

- An unconstructable miss stays `UnsatisfiableError` — raised once at the top of the walk by
  `Engine.#build`, with the composite arms using `undefined` to fall back internally.
- Under the activator, an argument that cannot be supplied should raise `UnsatisfiableError` naming
  **that argument's** type, chained through the existing `cause?: UnsatisfiableError` parameter to
  the type being built. The chain is what makes a five-deep failure readable.
- An `implType` that names no call shape is a caller fault, not a resolution failure, and should
  raise a plain `Error` — the way `namesAConstructor` already does for the registration surface:

  ```ts
  throw new Error(
    `${Type.stringify(implType)} describes nothing callable; name a constructor or function type, `
      + 'or an intersection of them for an overloaded implementation.',
  );
  ```

- `getService` swallows an `UnsatisfiableError` only when `error.type === target`, so a nested
  failure keeps propagating rather than reading as an absent service. That behaviour is right and
  neither option changes it.

## The witness — how this meets task #21

Task #21 asks a sibling question: an open registration's substituted slot resolves as an ordinary
service, so an implementation receives the closing type's _instance_ where it wanted the closing
_type_. The live casualty is the open logger registration, whose second slot is the bare hole:

```ts
const hole = Type.generic('$1');
m = m.addClass(Type.named('ILogger', '@rhombus-std/logging.core', [hole]), LoggerOfT, [[LOGGER_FACTORY_TYPE, hole]]);
```

`Logger<T>` wants the closing type to name its category. It gets whatever `$1` resolves to as a
service.

The compile-time half of the witness is already landed. `di.core`'s `brands.ts` declares it:

```ts
export type Typeof<T> = IsUnion<T> extends true ? never
  : [T] extends [Func<never[], unknown>] ? never
  : NamedType & { readonly [WITNESS]?: T; };
```

`logging.config` already writes `providerType: Typeof<T>` against it. What is missing is a **wire
spelling** — a `Type` node that means "the node for `X`, handed over as a value". The transform
still emits a `{ typeArg: N }` slot for such a parameter, and nothing in any library reads that
shape; it predates signatures being `Type[]`.

The right shape is a node kind, following the aggregates rather than the reserved-name list they
dissolved: kind `witness`, one `element` child, factory `Type.witness(element)`, wire spelling
`Typeof<E>` joining `Array` / `Iterable` / `Func` / `Ctor` / `ServiceProvider` in the reserved set
and normalizing in the `named` door the way the aggregates do. The engine arm is one line, because
the answer is already in hand:

```ts
protected override visitWitness(type: WitnessType): CallSite | undefined {
  return CallSite.constant(type.element);
}
```

Substitution needs nothing new: `Type.substitute` rewrites children, so `Typeof<$1>` closed against
`Foo` becomes `Typeof<Foo>` and the constant is the interned `Foo` node. The logger signs
`[[LOGGER_FACTORY_TYPE, Type.witness(hole)]]`, `IOptions<$T>` signs `[[Type.witness(hole)]]`, the
category bug closes and reload survives.

**The interplay, stated plainly: one mechanism does not serve both, and that is the useful finding.**
Both are the same doctrine — the engine answering from the request's own description with no
registration behind it — but the witness's answer is a `Type` node, which the engine is holding
already, while the activator's answer is a class, which it is not. The witness needs no value
channel and therefore none of section A's costs. It should not wait on the constructor decision, and
choosing option C here does not weaken it.

There is a composition worth noting in the other direction: once witness slots exist, an activator
call inside an open registration can be handed the closing type, which is what an implementation
generic over its own service type would need.

## Recommendation

**Take D and C, decline A and B, and rule the requirements sentence amended.**

1. **Land the deferred-maker arm for `ctor` (D).** It is what U4's own words say a call-shape node
   composes into, it costs one call-site kind and two arms, and it removes `ctor` from the list of
   non-identifier kinds that hard-miss. Falsifiable: if the owner reads U4's "composing looked-up
   leaves" as licensing an unregistered `new`, this is the wrong arm and D should be dropped — but
   then U4 and the `func` arm disagree with each other, since `func` composes a closure rather than
   invoking anything.
2. **Serve unregistered-class activation through a door that takes the class (C), if it is wanted at
   all.** The whole design already separates `impl` from `implType` at every point where a value and
   a description meet; the activator is that same pairing pointed at resolution instead of
   registration. Falsifiable: if a call site can be shown that needs to activate an unregistered
   class while holding only a `Type` — no class binding in scope — C cannot serve it and A becomes
   the only option. I could not construct such a call site: naming a class to construct requires the
   class to be nameable, and a nameable class is a value binding.
3. **Decline A.** It buys one feature at the price of the spelling round trip, a value-keyed intern
   seam, four visitor arms, and a derivation rule whose constraint cannot be declared. Every one of
   those is permanent; the feature is not load-bearing for anything currently in the repo.
4. **Decline B outright** — it is the one option that makes resolution depend on import order.
5. **Land the witness node independently (#21b).** It is cheap, its compile-time half already
   exists, and it fixes a live bug.
6. **Leave `object` alone** pending its own ruling.

## Owner decision points

1. **Which reading of a constructor-type spec is law** — U4's compose-a-callable, or the
   requirements' instantiate-an-unregistered-class? They are different features and the requirements
   sentence asserts the second as settled; it needs amending under either answer.
2. **Is unregistered-class activation wanted at all**, or does registering the class cover every real
   case?
3. **If wanted: which value channel** — the activator door (recommended), a value-carrying node kind,
   or a deposit table (recommended against).
4. **If the activator: where does it live** — a member on `IServiceProvider` in `di.core`, or a free
   function in `di`? And does it participate in scopes at all, or is its result always transient and
   uncached?
5. **Does a deferred maker realize as a plain function**, newable and callable both? A constructor
   type whose instance resolves to a primitive cannot be `new`ed meaningfully; that seems acceptable
   but should be said out loud.
6. **`getService(Ctor<…>)` would stop answering `undefined`** once `ctor` synthesizes — confirm that
   mirroring `func` is intended, since it removes optional constructor-typed dependencies.
7. **Object synthesis** — close the gap, or leave `ObjectType` unsynthesized because it doubles as a
   structural contract?
8. **The witness node** — adopt kind `witness` with wire spelling `Typeof<E>`, normalized in the
   `named` door beside the aggregates? And should the factory name track the kind (`Type.witness`)
   while the spelling tracks the existing brand (`Typeof`)?
9. **The transform's `{ typeArg: N }` slot emission** has no runtime reader. It retires or re-points
   to whatever spelling decision 8 lands on.
