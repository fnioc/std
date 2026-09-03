# The tagged lifetime model — design

Status: behavior and implementation shape given by the owner 2026-09-02; his word on the numbered
points is applied as it arrives; the architecture is drafted, its rows pending points 2 and 3 marked.

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

- **Where a factory comes from.** A factory resolved from a scoped provider holds that layer's head,
  so it cannot be one shared value. The addon registers the factory as a factory registration whose
  implementer answers the root-bound factory, so the built provider hands one out and injection plans
  normally; `beforeConstruct` overrides that node with the factory of the first layer in the request's
  chain, the scope the ask entered through. The override checks the node's registration against the
  addon's own by identity, so a user's registration of the factory address is a different
  registration, untouched by the hook, and wins by the registry's order as any registration does.
- **Disposal.** Each scoped provider subscribes the engine's dispose seam to release that layer's cache
  and captured instances, exactly as the standard model does. A disposed parent refuses every ask
  that passes through it, so its descendants are dead with it.
- **State.** No layer threads state to route dependencies: a node's tag and the request's chain
  decide which layer caches it.

## Awaiting the owner's word

Numbered as first put to him.

1. Same-tag nesting: ruled 2026-09-02, the choice left to this session; chosen: the middleware shape,
   the request's chain in crossing order, as laid out above.
2. Where a factory comes from: the owner proposed the layer's middleware intercepting the ask for the
   factory and answering its own, and asked for a better idea since that leaves a user's registration
   unable to override it. Proposed above: the registration plus the hook override, the override
   confined to the addon's own registration by identity. Awaiting his word.
3. A tagged service, say `Session` registered under the tag `session`, has a constructor parameter of
   type `IServiceProvider`. `Session` is resolved through a `request` scope opened inside a
   `session` scope, and the instance lands in the `session` scope's cache. Which provider object does
   the constructor receive: the `request` scope's, the one `resolve` was called on, or the `session`
   scope's, the one whose cache holds the instance? Recommended: the `session` scope's, as the
   standard model does, because the instance outlives the `request` scope and would otherwise hold a
   provider that dies before it. Awaiting his word.
4. Ruled 2026-09-02: `undefined` is in the vocabulary and is transient; refusing it would make
   transient registrations impossible, which is not something to stop.
5. Ruled 2026-09-02: separate interfaces, the tagged model's own beside the standard model's
   `IServiceScopeFactory`. Its name is proposed in the architecture.

## Architecture

Drafted against the di API at `origin/feat-di-request-door` 803fde07, where both engine seams the
standard model needed have landed: `Hooks.beforePlan`, and `ServiceProvider.whenDisposed` behind
`IServiceProvider extends Disposable, AsyncDisposable`. Rows marked _pending_ follow the owner's word
on points 2 and 3.

### Placement

| declaration                                                  | package | file                          | why there                                                                         |
| ------------------------------------------------------------ | ------- | ----------------------------- | --------------------------------------------------------------------------------- |
| `ITaggedServiceScopeFactory<Lifetime>`                       | di.core | named after the type          | a library opening scopes references abstractions only                             |
| `taggedLifetime()`, the layer, the request symbol, the hooks | di      | `src/addons/tagged-lifetime/` | it constructs the concrete `ServiceProvider`, which only the engine package holds |

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

await using root = Builder
  .useAddon(taggedLifetime<Lifetime>())
  .withServices(m => m.add(typefor<Session>(), Session, sessionCtorType, 'session'))
  .build();

using session = root.resolve(typefor<ITaggedServiceScopeFactory<Lifetime>>()).openScope('session');
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

function factoryFor(source: GetService): ITaggedServiceScopeFactory<Lifetime> {
  return { openScope: tag => openScope(source, tag) };
}
```

An ask entering a `request` scope opened from a `session` scope crosses the `request` layer, then
the `session` layer, then the head: its chain reads `[request, session]`, and the first layer carrying
a node's tag is the innermost open scope of that tag.

The factory is filed through `Addon.registrations` as a factory registration with no lifetime, its
address `typefor<ITaggedServiceScopeFactory<Lifetime>>()` open over the vocabulary, its implementer
answering the head-bound factory. That is what plans an injection site and what the built provider
answers; under any layer the hook below answers a factory bound there instead. _Pending 2._

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
  readonly under: Layer | undefined; // the layer whose construction encloses this one
}
```

The two-level cache key is the standard model's, for the same reasons: one entry per closing of an
open registration, one per registration of an address. The built provider owns no layer: it caches
nothing and captures nothing, so a transient reached through it is never captured.

### The hooks

| hook              | does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `beginResolve`    | answers `{ chain: request[chain] ?? [], under: undefined }`                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `beforeConstruct` | the addon's own factory registration, by identity: `{ result: factoryFor((state.under ?? state.chain[0])?.source ?? head) }`, _pending 2_. The engine's `IServiceProvider` row under a layer: `{ result: state.under.provider }`, _pending 3_. A value, an engine row, or a registration with no lifetime: `{ state }`. Otherwise `layer = chain.find(tag === lifetime)`: a hit in `layer.cache` answers `{ result }`, a miss `{ state: { chain, under: layer } }`. No layer on the chain carries the tag: point 6. |
| `afterConstruct`  | a node with a lifetime stores under the same rule; then captures the instance in the owning layer's list when it has `Symbol.dispose` or `Symbol.asyncDispose`: its own layer for a tagged node, `state.under ?? state.chain[0]` for a transient, nowhere when that is undefined. An owning layer already disposed disposes the instance at once and throws `ObjectDisposedError`.                                                                                                                                  |
| `canonicalize`    | not used                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `beforePlan`      | not used                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

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

6. A tagged node asked through a chain with no open scope of its tag, the built provider included:
   constructed as a transient, cached nowhere, or refused. Recommended: constructed as a transient,
   matching the built provider being transient, with a refusing validator possible later as a
   separate addon.
