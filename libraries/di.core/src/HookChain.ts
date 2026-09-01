import type { Type } from '@rhombus-std/primitives';
import type { Behavior, Koa } from './Behavior.js';
import type { Hooks } from './hooks.js';
import type { Registration } from './Registration/index.js';

/** How many parameters each hook's plain handler form declares; anything longer is middleware, the extra parameter being `next`. */
const handlerArity: Record<keyof Hooks, number> = {
  beginResolve: 2,
  beforeConstruct: 1,
  canonicalize: 2,
  afterConstruct: 2,
};

/**
 * One behavior's contribution to one hook, standing over everything installed before it.
 *
 * @remarks
 * A layer is never rewritten. Installing a behavior mints one layer per hook it writes, over the
 * chain as it stands, sharing everything already there — so a resolution holding a chain runs
 * exactly what was installed when it opened, however much is installed or disposed while it runs.
 */
interface Layer<Hook> {
  /** The hook, as the behavior wrote it. */
  readonly hook: Hook;
  /** Whether `hook` declares the trailing `next` and so drives what it encloses itself. */
  readonly middleware: boolean;
  /** The state slot this behavior threads through — the same one in every chain it joins. */
  readonly slot: number;
  /** The layer standing outside this one, farther from the engine; absent at the outermost. */
  readonly next: Layer<Hook> | undefined;
}

/** One hook's layers: the most recently installed at the head, the farthest from the engine at the end. */
type Chain<K extends keyof Hooks> = Layer<NonNullable<Behavior[K]>> | undefined;

/** `chain` with `hook` standing nearest the engine, or `chain` itself where the behavior wrote no such hook. */
function installed<Hook extends { readonly length: number; }>(chain: Layer<Hook> | undefined, member: keyof Hooks, hook: Hook | undefined, slot: number): Layer<Hook> | undefined {
  if (hook === undefined) {
    return chain;
  }
  return { hook, middleware: hook.length > handlerArity[member], slot, next: chain };
}

/** `chain` without the layer threading `slot`, sharing everything outside it. */
function uninstalled<Hook>(chain: Layer<Hook> | undefined, slot: number): Layer<Hook> | undefined {
  if (chain === undefined) {
    return undefined;
  }
  if (chain.slot === slot) {
    return chain.next;
  }
  const outside = uninstalled(chain.next, slot);
  return outside === chain.next ? chain : { ...chain, next: outside };
}

/** The layer of `chain` standing farthest from the engine of those `enclosing` stands over; absent where it stands over none. */
function farthest<Hook>(chain: Layer<Hook> | undefined, enclosing: Layer<Hook> | undefined): Layer<Hook> | undefined {
  if (chain === enclosing) {
    return undefined;
  }
  let layer = chain;
  while (layer !== undefined && layer.next !== enclosing) {
    layer = layer.next;
  }
  return layer;
}

/** `construction` as the behavior holding `slot` sees it: the same node, its own state and no one else's. */
function constructionForSlot(construction: HookChain.Construction, slot: number): Hooks.Construction {
  return {
    node: construction.node,
    populatedAddress: construction.populatedAddress,
    registration: construction.registration,
    state: construction.states[slot],
  };
}

/** `seen` as the layers beneath read it: whatever a middleware rewrote about the node, over the states the construction arrived carrying. */
function constructionBeneath(seen: Hooks.Construction, states: readonly unknown[]): HookChain.Construction {
  return {
    node: seen.node,
    populatedAddress: seen.populatedAddress,
    registration: seen.registration,
    states,
  };
}

/**
 * Opens what `enclosing` stands over, farthest from the engine outward.
 *
 * @remarks
 * A handler files the state it opens under into its own slot, everything nearer the engine having
 * opened first; middleware opens what it encloses by calling `next`, which answers back the very
 * state it was handed, no slot but this one being the middleware's to read.
 */
function runBeginResolve(chain: Chain<'beginResolve'>, enclosing: Chain<'beginResolve'>, request: Type, injected: readonly unknown[], opening: unknown[]): void {
  const layer = farthest(chain, enclosing);
  if (layer === undefined) {
    return;
  }
  if (layer.middleware) {
    opening[layer.slot] = (layer.hook as Koa<Hooks<any>['beginResolve']>)(request, injected[layer.slot], (beneathRequest, threaded) => {
      runBeginResolve(chain, layer, beneathRequest, injected, opening);
      return threaded;
    });
    return;
  }
  runBeginResolve(chain, layer, request, injected, opening);
  opening[layer.slot] = (layer.hook as Hooks<any>['beginResolve'])(request, injected[layer.slot]);
}

/**
 * Asks what `enclosing` stands over, farthest from the engine first.
 *
 * @remarks
 * A `{result}` answer wins outright and nothing nearer the engine runs; a `{state}` answer is filed
 * into that behavior's own slot, which is where its dependencies read it back.
 */
function runBeforeConstruct(chain: Chain<'beforeConstruct'>, enclosing: Chain<'beforeConstruct'>, construction: HookChain.Construction, within: unknown[]): HookChain.Interception {
  const layer = farthest(chain, enclosing);
  if (layer === undefined) {
    return undefined;
  }
  if (layer.middleware) {
    const answer = (layer.hook as Koa<Hooks<any>['beforeConstruct']>)(
      constructionForSlot(construction, layer.slot),
      seen => runBeforeConstruct(chain, layer, constructionBeneath(seen, construction.states), within) ?? { state: seen.state },
    );
    if ('result' in answer) {
      return answer;
    }
    within[layer.slot] = answer.state;
    return undefined;
  }
  const answer = (layer.hook as Hooks<any>['beforeConstruct'])(constructionForSlot(construction, layer.slot));
  if ('result' in answer) {
    return answer;
  }
  within[layer.slot] = answer.state;
  return runBeforeConstruct(chain, layer, construction, within);
}

/** Settles what the engine built: a handler transforms what everything nearer the engine already produced, so the farthest layer settles the canonical instance. */
function runCanonicalize(chain: Chain<'canonicalize'>, enclosing: Chain<'canonicalize'>, construction: HookChain.Construction, instance: unknown): unknown {
  const layer = farthest(chain, enclosing);
  if (layer === undefined) {
    return instance;
  }
  if (layer.middleware) {
    return (layer.hook as Koa<Hooks<any>['canonicalize']>)(
      constructionForSlot(construction, layer.slot),
      instance,
      (seen, transformed) => runCanonicalize(chain, layer, constructionBeneath(seen, construction.states), transformed),
    );
  }
  return (layer.hook as Hooks<any>['canonicalize'])(constructionForSlot(construction, layer.slot), runCanonicalize(chain, layer, construction, instance));
}

/** Tells what `enclosing` stands over that the engine has constructed: a handler runs after everything nearer the engine, so the farthest layer runs last. */
function runAfterConstruct(chain: Chain<'afterConstruct'>, enclosing: Chain<'afterConstruct'>, construction: HookChain.Construction, instance: unknown): void {
  const layer = farthest(chain, enclosing);
  if (layer === undefined) {
    return;
  }
  if (layer.middleware) {
    (layer.hook as Koa<Hooks<any>['afterConstruct']>)(
      constructionForSlot(construction, layer.slot),
      instance,
      (seen, settled) => runAfterConstruct(chain, layer, constructionBeneath(seen, construction.states), settled),
    );
    return;
  }
  runAfterConstruct(chain, layer, construction, instance);
  (layer.hook as Hooks<any>['afterConstruct'])(constructionForSlot(construction, layer.slot), instance);
}

/**
 * The four hooks the engine drives, each one chaining the behaviors that wrote it.
 *
 * @remarks
 * A chain is a value: installing or uninstalling answers a new one and rewrites nothing already
 * handed out, so the resolution holding a chain settles what runs through it. A behavior
 * owns the slot it was installed with and reads that same slot in each of the four hooks. A slot is
 * private to its owner — the chain reads the value out, hands the behavior that bare value, and
 * files back whatever the behavior answered — so nothing here lets one behavior read or overwrite
 * another's. The slots a construction is answered under are collected across the whole chain and
 * handed back in one array, which is what the dependency subtree then resolves under.
 */
export class HookChain {
  /** The chain of a container with nothing installed: supplies nothing, changes nothing, files no state. */
  static readonly identity = new HookChain(undefined, undefined, undefined, undefined, 0);

  readonly #beginResolve: Chain<'beginResolve'>;
  readonly #beforeConstruct: Chain<'beforeConstruct'>;
  readonly #canonicalize: Chain<'canonicalize'>;
  readonly #afterConstruct: Chain<'afterConstruct'>;

  /** How many state slots a resolution running through this chain threads. */
  readonly width: number;

  private constructor(
    beginResolve: Chain<'beginResolve'>,
    beforeConstruct: Chain<'beforeConstruct'>,
    canonicalize: Chain<'canonicalize'>,
    afterConstruct: Chain<'afterConstruct'>,
    width: number,
  ) {
    this.#beginResolve = beginResolve;
    this.#beforeConstruct = beforeConstruct;
    this.#canonicalize = canonicalize;
    this.#afterConstruct = afterConstruct;
    this.width = width;
  }

  /**
   * This chain with `behavior` standing nearest the engine, threading its state through `slot`.
   *
   * @remarks
   * One layer per hook `behavior` wrote, each over the chain that hook already had; a hook it left
   * off is handed back untouched and costs it nothing.
   */
  with(behavior: Behavior, slot: number): HookChain {
    return new HookChain(
      installed(this.#beginResolve, 'beginResolve', behavior.beginResolve, slot),
      installed(this.#beforeConstruct, 'beforeConstruct', behavior.beforeConstruct, slot),
      installed(this.#canonicalize, 'canonicalize', behavior.canonicalize, slot),
      installed(this.#afterConstruct, 'afterConstruct', behavior.afterConstruct, slot),
      Math.max(this.width, slot + 1),
    );
  }

  /** This chain without the behavior threading `slot`, everything standing outside it shared. */
  without(slot: number): HookChain {
    return new HookChain(
      uninstalled(this.#beginResolve, slot),
      uninstalled(this.#beforeConstruct, slot),
      uninstalled(this.#canonicalize, slot),
      uninstalled(this.#afterConstruct, slot),
      this.width,
    );
  }

  /**
   * Opens one resolution, each behavior filing into its own slot of `opening` the state its
   * constructions start under — seeded from `injected`, so a slot whose owner writes nothing keeps
   * what it was handed.
   */
  beginResolve(request: Type, injected: readonly unknown[], opening: unknown[]): void {
    runBeginResolve(this.#beginResolve, undefined, request, injected, opening);
  }

  /**
   * Runs before the engine constructs, answering a result to stand in place of constructing or
   * nothing at all — each behavior having filed into `within` the state its dependencies resolve
   * under, seeded from the states the construction arrived carrying.
   */
  beforeConstruct(construction: HookChain.Construction, within: unknown[]): HookChain.Interception {
    return runBeforeConstruct(this.#beforeConstruct, undefined, construction, within);
  }

  /** Settles what the engine has just constructed, the behavior nearest the engine transforming first and the farthest settling on the final instance. */
  canonicalize(construction: HookChain.Construction, instance: unknown): unknown {
    return runCanonicalize(this.#canonicalize, undefined, construction, instance);
  }

  /** Runs once the engine has constructed, the behavior nearest the engine first. */
  afterConstruct(construction: HookChain.Construction, instance: unknown): void {
    runAfterConstruct(this.#afterConstruct, undefined, construction, instance);
  }
}

export namespace HookChain {
  /** One construction as the chain sees it: where it sits, and every installed behavior's state as the construction arrived carrying it. */
  export interface Construction {
    /** This node's position in the resolution: one per node, referentially stable, opaque. */
    readonly node: object;
    /** The address this node answers, as it was requested, with any captures filled in. */
    readonly populatedAddress: Type;
    /** The registration that matched, absent when the engine rather than the manifest is answering. */
    readonly registration?: Registration<unknown>;
    /** One slot per installed behavior, each at the position its owner threads. */
    readonly states: readonly unknown[];
  }

  /** What the chain answers for a construction: a result standing in place of it, or nothing at all — go ahead and construct. */
  export type Interception = { readonly result: unknown; } | undefined;
}
