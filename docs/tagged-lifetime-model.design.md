# The tagged lifetime model — design

Status: behavior and implementation shape given by the owner 2026-09-02; his word on the numbered
points is being applied as it arrives; the architecture follows the last of them.

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
