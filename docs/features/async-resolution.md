# Async resolution

Resolution is synchronous end to end unless a registration itself is asynchronous. `Promise<T>` is
what makes something asynchronous — a registration that answers `Promise<T>` instead of `T`, or a
dependency that only has one of those to offer. `resolveAsync<T>()` is the one path that unwraps
it, awaiting the promise and everything beneath it that needed awaiting along the way. Nothing
else in the container ever awaits anything on your behalf.

## The sugar and its explicit form

```ts
const banner = await provider.resolveAsync<IBanner>();
```

is exactly what it reads as: derive the address, ask for its `Promise<...>` wrapping, await the
result.

```ts
const banner = await provider.resolve(Type.promise(typefor<IBanner>()));
```

`resolveAsync(address)` is `resolve(Promise<address>)` under the hood, so a factory registered once
under `IBanner` is reachable synchronously (through `resolve`) and asynchronously (through
`resolveAsync`) with no extra registration for the promise form: a `Promise<X>` ask with no
`Promise<X>` registration is answered by an `X` registration, its product handed over inside a
promise.

## Plain `resolve` never awaits

Asking `resolve()` for the `Promise<T>` address itself hands back a promise as a value, without the
container awaiting it on your behalf — nothing implicitly unwraps it for a caller who didn't ask
for that:

```ts
services = services.add<Promise<IBanner>>(fetchBanner);

const pending = provider.resolve<Promise<IBanner>>(); // a promise, not its value
const banner = await provider.resolveAsync<IBanner>(); // the same registration, awaited
```

Both calls reach the identical registration; the only difference is which address you asked for.

The converse does not hold. A plain `resolve<IBanner>()` against a manifest holding only the
`Promise<IBanner>` registration throws `UnsatisfiableError`: outside a promise-addressed ask there
is nothing to wait in, so the promise registration is a near miss the failure names rather than an
answer.

## One boundary, one wait

A promise-addressed ask opens exactly one boundary around the graph it resolves. Every dependency
inside that graph that has nothing but a `Promise<...>` registration to answer it is hoisted onto
that boundary's own inventory rather than opening a boundary of its own, and the whole inventory
settles together — the one point the resolution actually waits:

```ts
services = services
  .addValue<Promise<IClock>>(Promise.resolve(new Clock()))
  .add<IRepo>(SqlRepo); // constructor depends on IClock

const repo = await provider.resolveAsync<IRepo>(); // one await, however deep the promised deps run
```

A dependency two levels down that is itself only reachable through a promise joins the same
inventory as a dependency one level down — the graph is walked once, and everything it needs
awaited is awaited in parallel rather than one boundary re-entering another. Once the inventory has
settled, the walk beneath reads each settled value from the boundary and never waits again.

A failure anywhere in the inventory surfaces as one `AggregateError` naming the boundary's own
address and how many of its dependencies failed, carrying every distinct failure reason rather than
just the first one hit.

A boundary is pure plan structure: the wrapping promise is minted afresh on every ask, and no
lifetime model sees it. A registration that answers the promise address itself is the exception —
there the wrapping promise is that registration's own product, delivered through the same
boundary, so it is the registration's construction and carries the registration's lifetime.

```ts
services = services.add<Promise<IBanner>>(fetchBanner, 'app'); // the promise is the product, kept under 'app'
```

How long a construction is kept is the lifetime model's own concern, installed as an addon; the
engine only says which node the construction happens at.

## Async collections

`T[]` and `Iterable<T>` (see the collection resolution section in `docs/libraries/di.md`) are
synchronous — every element is realized as its step runs, and neither awaits anything.
`AsyncIterable<T>` is the async counterpart for a collection whose elements are each worth awaiting
one at a time:

```ts
for await (const plugin of provider.resolve<AsyncIterable<IPlugin>>()) {
  await plugin.start();
}
```

Each element is its own boundary, settled only as the step that reaches it runs — an element the
caller never iterates to is never realized at all, and a slow element never blocks one that sorts
before it in registration order. The sequence admits both spellings of an element in one authored
order: a `Promise<IPlugin>` registration and an `IPlugin` registration each contribute one element,
the latter delivered inside a promise. Re-iterating settles every element afresh.
