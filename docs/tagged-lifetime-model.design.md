# The tagged lifetime model — design

Status: behavior and implementation shape given by the owner 2026-09-02; every numbered point and the
factory name ruled by 2026-09-03; the architecture below stands on those rulings.

## Behavior

- The provider `Builder.build()` answers is transient: it caches nothing and tracks nothing. It has no
  lifetime behavior, only the ability to hand out a scope factory whose providers do.
- The vocabulary is the user's own union of tags, the `Lifetime` type argument, and `undefined` is a
  member of it: a registration whose lifetime is `undefined`, or omitted, is transient, cached by no
  scope. The scope factory's `openScope(lifetime)` takes one of the tags, typed by that argument, so
  resolving the factory spells the union out every time; users are encouraged to wrap that in their
  own helper so their code does not depend on the union. There is no scope for `undefined`, since
  nothing would be held in it.
- The factory is the tagged model's own interface, separate from the standard model's
  `IServiceScopeFactory`.
- `openScope(lifetime)` answers a provider that manages the cache for that one lifetime. There is no
  dictated order in which scopes open.
- The lifetime of what a scoped provider answers is bound to the variable holding that provider:
  disposing the provider ends the scope.
- A factory resolved from a scoped provider opens scopes that chain onto it. Every ask is checked by
  every scope on the chain, descendants first, then up the chain; a hit anywhere answers the cached
  instance.

## Implementation shape

- The addon's middleware is an installer that does nothing but give the addon a reference to the
  head of the chain beneath it. No lifetime behavior lives there.
- A scope factory wraps the head it holds with a middleware, and a `ServiceProvider` over it, that
  provides caching for the specified lifetime only; nodes registered to any other lifetime pass
  through untouched.
- A factory resolved from a scoped provider holds that scope's middleware as its head, so lifetime
  middlewares stack, one per open scope in the chain. This is the mirror of the standard model, whose
  markers never stack.
- The addon stages one set of hooks, at build. A hook acts on a node through the layer in charge of
  the node's lifetime, and finds that layer on the request: each layer's middleware records itself
  there as the ask crosses it, so the request carries the chain in crossing order, the descendant
  first.

## Mapping onto the API

- **Same-tag nesting.** For different tags order never matters: a node has one tag, one layer in the
  chain claims it. It matters only when a scope is opened inside another of the same tag, and there
  the descendant wins. The order comes from the middleware shape: the ask enters the descendant's
  middleware first, each middleware appends its layer to the request's chain, and a hook takes the
  first layer in the chain carrying the node's tag. No layer stages hooks of its own; the addon's
  installer stages the one set and activates it at the head.

  ```ts
  function layerMiddleware(request: Request) {
    (request[chain] ??= []).push(layer);
    return head(request);
  }

  function beforeConstruct(node, request) {
    const layer = request[chain].find(candidate => candidate.tag === node.lifetime);
    if (layer === undefined) {
      return {}; // transient: constructed every time
    }
    ...
  }
  ```

- **Where a factory comes from.** A factory resolved from a scoped provider opens scopes over that
  scope, so it cannot be one shared value. The addon files the factory as a normal registration with
  no lifetime, so the engine constructs a fresh one per resolution, and `afterConstruct` binds that
  one to the provider the ask came from: the first layer in the request's chain, or the head when
  the ask came from the built provider. The hook recognizes the addon's own registration by
  identity, so a user's registration of the factory address is a different registration, untouched,
  and wins by the registry's order as any registration does.
- **`IServiceProvider` injected.** The provider the ask came from, which the engine's own row
  already answers. The model does nothing.
- **Disposal.** Each scoped provider subscribes the engine's dispose seam to release that layer's cache
  and captured instances, exactly as the standard model does. A disposed parent refuses every ask
  that passes through it, so its descendants are dead with it.
- **State.** No layer threads state to route dependencies: a node's tag and the request's chain
  decide which layer caches it.

## Awaiting the owner's word

Numbered as first put to him.

1. Same-tag nesting: ruled 2026-09-02, the choice left to this session; chosen: the middleware shape,
   the request's chain in crossing order, as laid out above.
2. Ruled 2026-09-03: a normal registration, resolved normally, `afterConstruct` injecting what the
   factory needs; the lifetime it is registered with is the addon's to choose.
3. Ruled 2026-09-03: the provider the ask for the depender came from. A `Session` requested from a
   `request` scope holds that `request` scope's provider, whichever scope caches it.
4. Ruled 2026-09-02: `undefined` is in the vocabulary and is transient; refusing it would make
   transient registrations impossible, which is not something to stop.
5. Ruled 2026-09-02: separate interfaces, the tagged model's own beside the standard model's
   `IServiceScopeFactory`, named `ITaggedServiceScopeFactory`, accepted 2026-09-03.

## Architecture

Drafted against the di API at `origin/feat-di-request-door` 803fde07, where both engine seams the
standard model needed have landed: `Hooks.beforePlan`, and `ServiceProvider.whenDisposed` behind
`IServiceProvider extends Disposable, AsyncDisposable`.

### Placement

| declaration                                                                               | package | file                          | why there                                                                         |
| ----------------------------------------------------------------------------------------- | ------- | ----------------------------- | --------------------------------------------------------------------------------- |
| `ITaggedServiceScopeFactory<Lifetime>`                                                    | di.core | named after the type          | a library opening scopes references abstractions only                             |
| `taggedLifetime()`, `TaggedServiceScopeFactory`, the layer, the request symbol, the hooks | di      | `src/addons/tagged-lifetime/` | it constructs the concrete `ServiceProvider`, which only the engine package holds |

`ObjectDisposedError` is the standard model's, in di.core, shared. `@rhombus-std/di` re-exports
`taggedLifetime` beside `standardLifetime`; `@rhombus-std/di.core` re-exports the factory interface.
The request symbol stays module-level within `di`.

### Public declarations, all new

```ts
// di.core
/**
 * Opens scopes of the tagged lifetime model: one per tag of the vocabulary, each over the provider
 * this factory was resolved from, so scopes opened from a scoped provider chain onto it.
 */
export interface ITaggedServiceScopeFactory<Lifetime> {
  /** A provider caching registrations of `lifetime` alone; disposing it ends the scope. */
  openScope(lifetime: Exclude<Lifetime, undefined>): IServiceProvider;
}

// di
/** The tagged lifetime model as an addon over the user's vocabulary; `undefined` in it is transient. */
export function taggedLifetime<Lifetime>(): Addon<Lifetime>;
```

The type parameter is the vocabulary exactly as the user spells it, `undefined` included, so the
address the addon registers under is the address a user's `typefor` derives. `openScope` excludes
`undefined` from what it takes, since no scope holds transients.

### Usage

```ts
type Lifetime = 'session' | 'request' | undefined;

await using provider = Builder
  .useAddon(taggedLifetime<Lifetime>())
  .withServices(m => m.add(typefor<Session>(), Session, sessionCtorType, 'session'))
  .build();

using session = provider.resolve(typefor<ITaggedServiceScopeFactory<Lifetime>>()).openScope('session');
using request = session.resolve(typefor<ITaggedServiceScopeFactory<Lifetime>>()).openScope('request');
const s = request.resolve(typefor<Session>()); // constructed once per session scope
```

### The chain

The addon's one `Middleware` stages the hooks and answers the head. The head is what a factory
resolved from the built provider binds to. A scope is a layer over the source of the provider it was
opened from: the layer's middleware refuses when the layer is disposed, appends the layer to the
request's chain on the way down, and passes the ask on. The provider it is minted over is the scope.

```ts
function middleware(next: GetService): GetService {
  const control = next(new ControlRequest(typefor<ControlService>())) as ControlService;
  const handle = control.stageHooks(hooks);
  return function head(request) {
    return next(request.activate(handle));
  };
}

function openScope(parent: GetService, tag: Exclude<Lifetime, undefined>): IServiceProvider {
  const layer = new Layer(tag);
  layer.source = function scoped(request) {
    if (layer.disposed) {
      throw new ObjectDisposedError();
    }
    (request[chain] ??= []).push(layer);
    return parent(request);
  };
  layer.provider = new ServiceProvider(layer.source);
  layer.provider.whenDisposed(releaseOf(layer));
  return layer.provider;
}

class TaggedServiceScopeFactory implements ITaggedServiceScopeFactory<Lifetime> {
  source: GetService = head; // rebound by afterConstruct to the source the ask came from

  openScope(tag: Exclude<Lifetime, undefined>): IServiceProvider {
    return openScope(this.source, tag);
  }
}
```

An ask entering a `request` scope opened from a `session` scope crosses the `request` layer, then
the `session` layer, then the head: its chain reads `[request, session]`, and the first layer carrying
a node's tag is the innermost open scope of that tag.

The factory is filed through `Addon.registrations` as a constructor registration of
`TaggedServiceScopeFactory` with no lifetime, its address `typefor<ITaggedServiceScopeFactory<Lifetime>>()`
open over the vocabulary. The engine constructs one per resolution, injected or asked for directly,
and `afterConstruct` binds it.

### State

```ts
interface Layer {
  readonly tag: Exclude<Lifetime, undefined>;
  readonly cache: Map<Registration<unknown>, Map<Type, unknown>>; // by registration identity, then by populated address
  readonly disposables: unknown[]; // capture order
  source: GetService; // what openScope wraps and what a factory resolved here binds to
  provider: IServiceProvider;
  disposed: boolean;
}

interface State {
  readonly chain: readonly Layer[]; // the request's, innermost first; empty through the built provider
}
```

The two-level cache key is the standard model's, for the same reasons: one entry per closing of an
open registration, one per registration of an address. The built provider owns no layer: it caches
nothing and captures nothing, so a transient reached through it is never captured.

### The hooks

| hook              | does                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `beginResolve`    | answers `{ chain: request[chain] ?? [] }`                                                                                                                                                                                                                                                                                                                                                                        |
| `beforeConstruct` | `layer = chain.find(tag === registration.lifetime)`: a hit in `layer.cache` answers `{ result }`, a miss `{ state }`. Every other node, a value, an engine row, a registration with no lifetime, or a tag no layer on the chain carries, goes to the engine untouched: `{ state }`.                                                                                                                              |
| `afterConstruct`  | the addon's own factory registration, by identity: `instance.source = chain[0]?.source ?? head`. A node whose tag a layer carries: stores in `layer.cache` under the two-level key, then captures the instance in `layer.disposables` when it has `Symbol.dispose` or `Symbol.asyncDispose`; a layer already disposed disposes the instance at once and throws `ObjectDisposedError`. Every other node: nothing. |
| `canonicalize`    | not used                                                                                                                                                                                                                                                                                                                                                                                                         |
| `beforePlan`      | not used                                                                                                                                                                                                                                                                                                                                                                                                         |

What the construction produced is what is cached, a promise included; a rejecting promise evicts its
entry, and its settled value is what is captured, on settlement, as in the standard model.

### Disposal

- Disposing a scope's provider: `whenDisposed` tells the layer, which marks itself disposed and runs
  the standard model's walk over its list: deduplicated by reference, reverse order, every error
  collected, one rethrown as itself and more than one as an `AggregateError`; the synchronous form
  records an error for an instance with only `Symbol.asyncDispose`, the asynchronous form awaits
  each. A second dispose is a no-op. Every ask through that provider, and through every provider
  opened beneath it, refuses first with `ObjectDisposedError`, since a descendant's source calls its
  parent's.
- Disposing the built provider: it holds nothing, so nothing is released; the head refuses every ask
  afterwards, which ends every open scope's resolutions with it. The head learns of that disposal
  the way the standard model's container marker does.

## Awaiting the owner's word, continued

6. Ruled 2026-09-03: the model acts only on a node whose registered lifetime a layer on the chain
   carries; every other node goes to the engine untouched, so a tag with no open scope resolves as a
   transient. Consequence written into the hooks: a transient is never captured for disposal, by any
   layer.
