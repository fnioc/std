import type { AfterConstructHandler, AfterConstructMiddleware, BeforeConstructHandler, BeforeConstructMiddleware, BeginResolveHandler, BeginResolveMiddleware, Behavior, CanonicalizeHandler,
  CanonicalizeMiddleware, Hooks } from '@rhombus-std/di.core';
import type { Func } from '@rhombus-toolkit/func';

/** The chain every hook starts from: it supplies nothing, changes nothing, and passes the state straight through. */
const identity: Hooks = {
  beginResolve(_request, injected) {
    return injected;
  },
  beforeConstruct(construction) {
    return { state: construction.state };
  },
  canonicalize(_construction, instance) {
    return instance;
  },
  afterConstruct() {},
};

/** Whether `hook` was written as middleware: it owns the chain when it declares more parameters than the handler form does. */
function ownsChain(hook: Func, handlerArity: number): boolean {
  return hook.length > handlerArity;
}

/** Middleware runs in place of `next` and calls it itself; a handler transforms the injection `next` answered. */
function composeBeginResolve(hook: Func, next: BeginResolveHandler): BeginResolveHandler {
  if (ownsChain(hook, 2)) {
    const middleware = hook as BeginResolveMiddleware;
    return function beginResolve(request, injected) {
      return middleware(request, injected, next);
    };
  }
  const handler = hook as BeginResolveHandler;
  return function beginResolve(request, injected) {
    return handler(request, next(request, injected));
  };
}

/** A handler's own `{result}` answer wins outright; its `{state}` re-threads the construction `next` then sees. */
function composeBeforeConstruct(hook: Func, next: BeforeConstructHandler): BeforeConstructHandler {
  if (ownsChain(hook, 1)) {
    const middleware = hook as BeforeConstructMiddleware;
    return function beforeConstruct(construction) {
      return middleware(construction, next);
    };
  }
  const handler = hook as BeforeConstructHandler;
  return function beforeConstruct(construction) {
    const answer = handler(construction);
    if ('result' in answer) {
      return answer;
    }
    return next({ ...construction, state: answer.state });
  };
}

/** A handler transforms first and hands its answer on, so the innermost layer settles the canonical instance. */
function composeCanonicalize(hook: Func, next: CanonicalizeHandler): CanonicalizeHandler {
  if (ownsChain(hook, 2)) {
    const middleware = hook as CanonicalizeMiddleware;
    return function canonicalize(construction, instance) {
      return middleware(construction, instance, next);
    };
  }
  const handler = hook as CanonicalizeHandler;
  return function canonicalize(construction, instance) {
    return next(construction, handler(construction, instance));
  };
}

/** A handler runs after everything downstream of it, so the innermost layer runs first and the outermost last. */
function composeAfterConstruct(hook: Func, next: AfterConstructHandler): AfterConstructHandler {
  if (ownsChain(hook, 2)) {
    const middleware = hook as AfterConstructMiddleware;
    return function afterConstruct(construction, instance) {
      middleware(construction, instance, next);
    };
  }
  const handler = hook as AfterConstructHandler;
  return function afterConstruct(construction, instance) {
    next(construction, instance);
    handler(construction, instance);
  };
}

/** One bundle of hooks settled into what it contributes: the chain standing outside whatever is handed to it. */
export type HookLayer = Func<[inner: Hooks], Hooks>;

/** Settles `behavior` into its layer, once; a hook it wrote nothing against costs the chain nothing. */
export function hookLayer(behavior: Behavior): HookLayer {
  return inner => ({
    beginResolve: behavior.beginResolve ? composeBeginResolve(behavior.beginResolve, inner.beginResolve) : inner.beginResolve,
    beforeConstruct: behavior.beforeConstruct ? composeBeforeConstruct(behavior.beforeConstruct, inner.beforeConstruct) : inner.beforeConstruct,
    canonicalize: behavior.canonicalize ? composeCanonicalize(behavior.canonicalize, inner.canonicalize) : inner.canonicalize,
    afterConstruct: behavior.afterConstruct ? composeAfterConstruct(behavior.afterConstruct, inner.afterConstruct) : inner.afterConstruct,
  });
}

/** `inner` with `outer` standing over it. */
function layered(inner: Hooks, outer: HookLayer): Hooks {
  return outer(inner);
}

/**
 * Folds one engine's installed hooks into a single {@link Hooks}: the most recently installed
 * layer stands innermost, closest to the construction, and the earliest-installed layer stands
 * outermost — which is what lets an addon's built-in hook call `next` and see the answer a later
 * install gave. An empty list folds to the identity itself.
 */
export function foldHooks(installed: readonly HookLayer[]): Hooks {
  return installed.reduceRight(layered, identity);
}
