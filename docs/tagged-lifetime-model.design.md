# The tagged lifetime model — design

Status: behavior and implementation shape given by the owner 2026-09-02; four points below await his
word before the architecture is written.

## Behavior

- The provider `Builder.build()` answers is transient: it caches nothing and tracks nothing. It has no
  lifetime behavior, only the ability to hand out a scope factory whose providers do.
- The vocabulary is the user's own union of tags, the `Lifetime` type argument. The scope factory's
  `openScope(lifetime)` takes one of them, typed by that argument, so resolving the factory spells
  the union out every time; users are encouraged to wrap that in their own helper so their code does
  not depend on the union.
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
- Each layer's hooks act on a node only when the node's registration carries the lifetime that layer
  is in charge of.

## Mapping onto the API

- **Same-tag nesting.** For different tags order never matters: a node has one tag, one layer in the
  chain claims it. It matters only when a scope is opened inside another of the same tag, and there
  the descendant wins. Staged hooks run in the order they were staged, the parent's first, so the
  request carries the order instead: on the way down, each layer records itself as the owner of its
  tag on the request unless a layer already did, and the descendant writes first because the ask
  enters its middleware first. In `beforeConstruct` a layer acts only when the ask's owner for the
  node's tag is itself.

  ```ts
  request[owner] ??= new Map();
  if (!request[owner].has(tag)) {
    request[owner].set(tag, layer);
  }
  return head(request.activate(handle));
  ```

- **Where a factory comes from.** A factory resolved from a scoped provider holds that layer's head,
  so it cannot be one shared value. The addon registers the factory as a factory registration whose
  implementer answers the root-bound factory, so the built provider hands one out and injection plans
  normally; every layer's `beforeConstruct` overrides that node with a factory bound to itself, the
  descendant winning by the same owner stamp.
- **Disposal.** Each scoped provider subscribes the engine's dispose seam to release that layer's cache
  and captured instances, exactly as the standard model does. A disposed parent refuses every ask
  that passes through it, so its descendants are dead with it.
- **State.** No layer threads state to route dependencies: a node's tag alone decides which layer
  caches it, and every ancestor's hooks are active for an ask that entered a descendant.

## Awaiting the owner's word

Numbered as first put to him.

1. Same-tag nesting: a scope opened inside another of the same tag, the descendant winning through
   the owner stamp on the request, as laid out above. Confirm.
2. Where a factory comes from: a factory registration whose implementer answers the root-bound
   factory, every layer's `beforeConstruct` overriding that node with a factory bound to itself, the
   descendant winning by the same stamp. Confirm.
3. `IServiceProvider` injected into a tagged service: the provider the ask entered through, or the
   provider of the scope that caches the instance. Recommended: the caching scope's, as the standard
   model does, since the instance outlives the entering ask.
4. Vocabulary: is an omitted lifetime admitted, meaning never cached at any scope? Recommended: yes,
   which makes an untagged registration transient everywhere and matches the built provider being
   transient.
5. The factory abstraction: one generic `IServiceScopeFactory` shared with the standard model, whose
   `openScope` takes the tag when the vocabulary needs one and nothing otherwise, or a second
   interface. Recommended: one generic, so di.core carries a single scope-opening abstraction.
