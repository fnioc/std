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

lowers to exactly what it reads as: derive the address, ask for its `Promise<...>` wrapping, await
the result.

```ts
const banner = await provider.resolve(Type.promise(typefor<IBanner>()));
```

`resolveAsync(address)` is `resolve(Promise<address>)` under the hood — the same registration
answers either spelling, so a factory registered once under `IBanner` is reachable synchronously
(if it happens to produce one without awaiting) and asynchronously (through `resolveAsync`) with no
extra registration for the promise form.

## Plain `resolve` never awaits

Asking `resolve()` for the `Promise<T>` address itself hands back the promise as a value, without
the container awaiting it on your behalf — nothing implicitly unwraps it for a caller who didn't
ask for that:

```ts
services = services.addFactory<Promise<IBanner>>(fetchBanner).as<'singleton'>();

const pending = provider.resolve<Promise<IBanner>>(); // the promise itself, not its value
const banner = await provider.resolveAsync<IBanner>(); // the same registration, awaited
```

Both calls reach the identical registration; the only difference is which address you asked for.

## One boundary, one wait

A `resolveAsync` ask opens exactly one boundary around the graph it resolves. Every dependency
inside that graph that has nothing but a `Promise<...>` registration to answer it gets collected
into that boundary's own inventory rather than opening a boundary of its own, and the whole
inventory settles together — the one point the resolution actually waits:

```ts
services = services
  .addValue(Type.promise(typefor<IClock>()), Promise.resolve(new Clock()))
  .addClass<IRepo>(SqlRepo).as<'singleton'>(); // constructor depends on IClock

const repo = await provider.resolveAsync<IRepo>(); // one await, however deep the promised deps run
```

A dependency two levels down that is itself only reachable through a promise joins the same
inventory as a dependency one level down — the graph is walked once, and everything it needs
awaited is awaited in parallel rather than one boundary re-entering another.

A failure anywhere in the inventory surfaces as one `AggregateError` naming the boundary's own
address and how many of its dependencies failed, carrying every distinct failure reason rather than
just the first one hit.

## Async collections

`T[]` and `Iterable<T>` (see the collection-resolution divergence in `docs/libraries/di.md`) are
eager and synchronous — every element is realized up front, whatever its own lifetime. `AsyncIterable<T>`
is the async counterpart for a collection whose elements are each worth awaiting one at a time:

```ts
for await (const plugin of provider.resolve<AsyncIterable<IPlugin>>()) {
  await plugin.start();
}
```

Each element is its own boundary, settled only as the step that reaches it runs — an element the
caller never iterates to is never realized at all, and a slow element never blocks one that sorts
before it in registration order.

## Async disposal

A scope's teardown has two forms: `[Symbol.dispose]()` releases everything synchronously, and
`[Symbol.asyncDispose]()` awaits each release in turn. Both walk the same instances in the same
order — every child scope torn down before what the parent itself kept, newest claim first — the
async form is simply the one able to wait for a release that needs waiting for.

```ts
await using scope = provider.createScope('request'); // Symbol.asyncDispose awaits owned pendings
```

An instance offering both `Symbol.asyncDispose` and `Symbol.dispose` is released through the async
one when torn down asynchronously; a synchronous teardown meeting an instance that offers only the
async protocol throws, naming the instance's address, rather than skipping it silently.

**Reach** is what decides whether a promise-shaped product gets released at all. A `Promise<T>`
registration `resolveAsync` awaited puts its settled value in the scope's reach — async teardown
awaits the same promise again (already settled, so this costs nothing but a microtask) and releases
what it produced. A `Promise<T>` registration handed back raw by a plain `resolve()` call is out of
reach: the scope tracks it as the answer it gave, but never awaits it and never releases what it
settles to — whoever called `resolve()` and got the promise owns whatever it becomes. Asking a
synchronous `[Symbol.dispose]()` to release a kept promise throws for the same reason an async-only
disposable does: there is no synchronous way to reach the value inside it.
