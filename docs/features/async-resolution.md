# Async resolution

Some dependencies are only ever ready after an await — a remote config fetch, a warmed connection
pool, a schema read off disk. Most containers make that your problem: every consumer above the
async piece turns async too, or you bolt a two-phase startup on the side. Here you register the
promise and ask for the value. Resolution stays synchronous end to end unless a registration itself
is asynchronous, `Promise<T>` is the one spelling that makes it so, and `resolveAsync<T>()` is the one
path that unwraps it — awaiting the promise and everything beneath it that needed awaiting, in one
wait, in parallel, on your behalf. Nothing else in the container ever awaits anything for you, so a
synchronous graph stays exactly as fast and as predictable as it was.

## Register the promise, ask for the value

One registration answers both spellings. A factory registered once under `IBanner` is reachable
synchronously through `resolve` and asynchronously through `resolveAsync`, with no second
registration for the promise form:

```ts
services = services.add<IBanner>(makeBanner); // a plain IBanner factory

const banner = provider.resolve<IBanner>(); // synchronous, as ever
const later = await provider.resolveAsync<IBanner>(); // the same registration, delivered in a promise
```

The sugar is exactly what it reads as: derive the address, ask for its `Promise<...>` wrapping, await
the result.

```ts
const banner = await provider.resolve(Type.promise(typefor<IBanner>()));
```

`resolveAsync(address)` is `resolve(Promise<address>)` under the hood, and a `Promise<X>` ask with no
`Promise<X>` registration is answered by an `X` registration, its product handed over inside a
promise.

## Plain `resolve` never awaits

A promise you asked for is a promise you get. Asking `resolve()` for the `Promise<T>` address hands
back the promise as a value; nothing implicitly unwraps it for a caller who didn't ask for that, so a
consumer that wants to hold a pending value and await it on its own schedule can.

```ts
services = services.add<Promise<IBanner>>(fetchBanner);

const pending = provider.resolve<Promise<IBanner>>(); // a promise, not its value
const banner = await provider.resolveAsync<IBanner>(); // the same registration, awaited
```

Both calls reach the identical registration; the only difference is which address you asked for.

The converse is not faked. A settled type that only a `Promise<IBanner>` registration can answer has
no synchronous answer — outside a promise-addressed ask there is nothing to wait in — so it simply
misses, the way any dependency the manifest does not produce does: an optional one falls back to its
alternative, a required one is unsatisfiable. Reach for `resolveAsync` (or ask for the
`Promise<IBanner>` address) to get the value the promise carries.

## Boundaries and waits

Depth costs you little. A promise-addressed ask opens a boundary around the graph it resolves; every
dependency inside that graph with nothing but a `Promise<...>` registration to answer it is hoisted
onto the nearest enclosing boundary as one of its descendants, and a boundary settles all of its
descendants together — the points the resolution actually waits:

```ts
services = services
  .addValue<Promise<IClock>>(connectClock())
  .add<IRepo>(SqlRepo); // constructor takes an IClock — no promise in sight

const repo = await provider.resolveAsync<IRepo>(); // one await, however deep the promised deps run
```

`SqlRepo` is written against `IClock`, not `Promise<IClock>`; the container does the awaiting where
the constructor cannot. A dependency further down that is itself only reachable through a promise
becomes a descendant of the await that encloses it, and settles its own descendants before it
resolves — so the graph is walked once, the independent awaits at each level settle in parallel, and
depth waits only as far as it nests. Once a boundary's descendants have settled the walk beneath
reads each value and never waits again.

Failure is reported whole. A failure anywhere in a boundary's descendants surfaces as one
`AggregateError` naming that boundary's own address and how many of its dependencies failed, carrying
every distinct reason rather than just the first one hit — so one failed startup tells you everything
that was wrong with it.

A boundary is pure plan structure: the wrapping promise is minted afresh on every ask, and no
lifetime model sees it. A registration that answers the promise address itself is the one exception
— there the wrapping promise is that registration's own product, delivered through the same
boundary, so it is the registration's construction and carries the registration's lifetime:

```ts
services = services.add<Promise<IBanner>>(fetchBanner, 'app'); // the promise is the product, kept under 'app'
```

How long a construction is kept is the lifetime model's own concern, installed as an addon; the
engine says only which node the construction happens at.

## Async collections

`T[]` and `Iterable<T>` (see the collection resolution section in `docs/libraries/di.md`) are
synchronous — every element is realized as its step runs, and neither awaits anything.
`AsyncIterable<T>` is the async counterpart for a collection whose elements are each worth awaiting
one at a time, and it composes with `for await` exactly as you'd hope:

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
