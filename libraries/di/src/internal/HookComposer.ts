import type { AfterConstructHandler, AfterConstructMiddleware, BeforeConstructHandler, BeforeConstructMiddleware, BeginResolveHandler, BeginResolveMiddleware, CanonicalizeHandler,
  CanonicalizeMiddleware, Construction, HookOptions, Hooks, Registration } from '@rhombus-std/di.core';
import type { Type } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';

/** The verdict on whether one filed handler runs at a node. */
type Interest = Func<[registration: Registration<unknown> | undefined, address: Type], boolean>;

/** One filed contribution to a hook: the function, whether it declared `next` and so owns the chain, and what it asked to be spared. */
interface Layer {
  readonly fn: Func;
  readonly ownsChain: boolean;
  readonly interest: Interest | undefined;
}

/** The chain every hook starts from: it supplies nothing, changes nothing, and passes the context straight through. */
const identity: Hooks = {
  beginResolve(_request, injected) {
    return injected;
  },
  beforeConstruct(construction) {
    return { within: construction.context };
  },
  canonicalize(_construction, instance) {
    return instance;
  },
  afterConstruct() {},
};

/**
 * `interested` with its verdicts kept — by registration, or by interned address for a node no
 * registration stands behind — so each one is decided once and outlives the resolution that asked.
 */
function remembering(options: HookOptions<any>, interested: NonNullable<HookOptions<any>['interested']>): Interest {
  const byRegistration = new WeakMap<Registration<unknown>, boolean>();
  const byAddress = new Map<Type, boolean>();
  return function interest(registration, address) {
    if (registration === undefined) {
      return byAddress.getOrInsertComputed(address, () => interested.call(options, undefined, address));
    }
    return byRegistration.getOrInsertComputed(registration, () => interested.call(options, registration, address));
  };
}

/** Whether `fn` was written as middleware: it owns the chain when it declares more parameters than the handler form does. */
function ownsChain(fn: Func, handlerArity: number): boolean {
  return fn.length > handlerArity;
}

/** `layered` where `interest` says the node is one of its own, and straight on to `next` where it does not. */
function gatingOnConstruction<Answer>(interest: Interest, layered: Func<[Construction], Answer>, next: Func<[Construction], Answer>): Func<[Construction], Answer> {
  return function gated(construction) {
    return interest(construction.registration, construction.populatedAddress) ? layered(construction) : next(construction);
  };
}

/** `layered` where `interest` says the node is one of its own, and straight on to `next` where it does not. */
function gatingOnInstance<Answer>(
  interest: Interest,
  layered: Func<[Construction, unknown], Answer>,
  next: Func<[Construction, unknown], Answer>,
): Func<[Construction, unknown], Answer> {
  return function gated(construction, instance) {
    return interest(construction.registration, construction.populatedAddress) ? layered(construction, instance) : next(construction, instance);
  };
}

/** Middleware runs in place of `next` and calls it itself; a handler transforms the injection `next` answered. */
function composeBeginResolve(layer: Layer, next: BeginResolveHandler): BeginResolveHandler {
  if (layer.ownsChain) {
    const middleware = layer.fn as BeginResolveMiddleware;
    return function beginResolve(request, injected) {
      return middleware(request, injected, next);
    };
  }
  const handler = layer.fn as BeginResolveHandler;
  if (next === identity.beginResolve) {
    return handler;
  }
  return function beginResolve(request, injected) {
    return handler(request, next(request, injected));
  };
}

/** A handler's own `{instance}` answer wins outright; its `{within}` re-threads the construction `next` then sees. */
function composeBeforeConstruct(layer: Layer, next: BeforeConstructHandler): BeforeConstructHandler {
  const layered = ((): BeforeConstructHandler => {
    if (layer.ownsChain) {
      const middleware = layer.fn as BeforeConstructMiddleware;
      return function beforeConstruct(construction) {
        return middleware(construction, next);
      };
    }
    const handler = layer.fn as BeforeConstructHandler;
    if (next === identity.beforeConstruct) {
      return handler;
    }
    return function beforeConstruct(construction) {
      const answer = handler(construction);
      if ('instance' in answer) {
        return answer;
      }
      return next({ ...construction, context: answer.within });
    };
  })();
  // A middleware layer owns its own unwrap/rewrap of the construction, so gating it here would
  // skip that re-threading entirely; only a plain handler's skip is transparent to what follows.
  return !layer.ownsChain && layer.interest ? gatingOnConstruction(layer.interest, layered, next) : layered;
}

/** A handler transforms first and hands its answer on, so the innermost layer settles the canonical instance. */
function composeCanonicalize(layer: Layer, next: CanonicalizeHandler): CanonicalizeHandler {
  const layered = ((): CanonicalizeHandler => {
    if (layer.ownsChain) {
      const middleware = layer.fn as CanonicalizeMiddleware;
      return function canonicalize(construction, instance) {
        return middleware(construction, instance, next);
      };
    }
    const handler = layer.fn as CanonicalizeHandler;
    if (next === identity.canonicalize) {
      return handler;
    }
    return function canonicalize(construction, instance) {
      return next(construction, handler(construction, instance));
    };
  })();
  return !layer.ownsChain && layer.interest ? gatingOnInstance(layer.interest, layered, next) : layered;
}

/** A handler runs after everything downstream of it, so the innermost layer runs first and the outermost last. */
function composeAfterConstruct(layer: Layer, next: AfterConstructHandler): AfterConstructHandler {
  const layered = ((): AfterConstructHandler => {
    if (layer.ownsChain) {
      const middleware = layer.fn as AfterConstructMiddleware;
      return function afterConstruct(construction, instance) {
        middleware(construction, instance, next);
      };
    }
    const handler = layer.fn as AfterConstructHandler;
    if (next === identity.afterConstruct) {
      return handler;
    }
    return function afterConstruct(construction, instance) {
      next(construction, instance);
      handler(construction, instance);
    };
  })();
  return !layer.ownsChain && layer.interest ? gatingOnInstance(layer.interest, layered, next) : layered;
}

/**
 * Folds everything filed through the door into the one {@link Hooks} the engine holds.
 *
 * @remarks
 * Composition happens as each layer is filed, never per construction: the chains stand ready before
 * the first resolution and cost nothing but the frames they actually contain — a hook nobody filed
 * against is the identity itself. The layer filed last sits innermost, so a lifetime model filing
 * after every addon runs closest to the construction.
 */
export class HookComposer {
  readonly #beginResolve: Layer[] = [];
  readonly #beforeConstruct: Layer[] = [];
  readonly #canonicalize: Layer[] = [];
  readonly #afterConstruct: Layer[] = [];
  #hooks: Hooks = identity;

  /** What the engine resolves through, as everything filed so far composes. */
  get hooks(): Hooks {
    return this.#hooks;
  }

  onBeginResolve(fn: Func): void {
    this.#beginResolve.push(this.#layer(fn, 2, undefined));
    this.#recompose();
  }

  onBeforeConstruct(fn: Func, options?: HookOptions<any>): void {
    this.#beforeConstruct.push(this.#layer(fn, 1, options));
    this.#recompose();
  }

  onCanonicalize(fn: Func, options?: HookOptions<any>): void {
    this.#canonicalize.push(this.#layer(fn, 2, options));
    this.#recompose();
  }

  onAfterConstruct(fn: Func, options?: HookOptions<any>): void {
    this.#afterConstruct.push(this.#layer(fn, 2, options));
    this.#recompose();
  }

  #layer(fn: Func, handlerArity: number, options: HookOptions<any> | undefined): Layer {
    const interested = options?.interested;
    return {
      fn,
      ownsChain: ownsChain(fn, handlerArity),
      interest: interested && remembering(options!, interested),
    };
  }

  #recompose(): void {
    this.#hooks = {
      beginResolve: this.#beginResolve.reduceRight((next, layer) => composeBeginResolve(layer, next), identity.beginResolve),
      beforeConstruct: this.#beforeConstruct.reduceRight((next, layer) => composeBeforeConstruct(layer, next), identity.beforeConstruct),
      canonicalize: this.#canonicalize.reduceRight((next, layer) => composeCanonicalize(layer, next), identity.canonicalize),
      afterConstruct: this.#afterConstruct.reduceRight((next, layer) => composeAfterConstruct(layer, next), identity.afterConstruct),
    };
  }
}
