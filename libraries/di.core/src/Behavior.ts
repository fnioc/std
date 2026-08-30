import type { Func } from '@rhombus-toolkit/func';
import type { HookChain, Hooks } from './hooks.js';

/**
 * The koa pattern: a handler's middleware form is the same signature with a trailing `next` —
 * standing for everything beneath this layer — appended to the argument list, called in `next`'s
 * own place rather than run for it automatically.
 */
export type Koa<Handler> = Handler extends Func<infer Args extends readonly unknown[], infer Answer> ? Func<[...Args, next: Handler], Answer>
  : never;

/**
 * One contribution to what a resolution runs through: any of the four hooks, none of them required.
 *
 * @remarks
 * Every member takes either a plain handler — {@link Hooks}' own shape for it — or middleware for
 * that hook, the {@link Koa} form: the same signature with a trailing `next`, everything composed
 * beneath it run by calling it. The two are told apart by how many parameters the function declares,
 * so middleware has to declare all of them, `next` included.
 *
 * State is threaded through a slot of this behavior's own, private to it for as long as the install
 * lives: a hook is handed that slot's bare value and what it answers goes straight back into that
 * slot, so no state another behavior threads is reachable from here and none of this one's is
 * reachable from there. What a middleware's `next` answers therefore carries the outcome alone — a
 * result standing in place of the construction, or the very state the middleware handed it, meaning
 * everything beneath ran and had nothing to report.
 *
 * A resolution folds the behaviors accompanying it into one {@link HookChain}, the first behavior
 * innermost, and the container's own behaviors wrap the result. A standalone implementation of one
 * member on its own, predefined before it's assigned, is typed by indexed access —
 * `Behavior['beforeConstruct']`.
 *
 * @typeParam State - the shape of the state these handlers thread through a resolution.
 */
export type Behavior<State = any> = {
  readonly [K in keyof Hooks<State>]?: Hooks<State>[K] | Koa<Hooks<State>[K]>;
};

export namespace Behavior {
  /** How many parameters each hook's plain handler form declares; anything longer is middleware, the extra parameter being `next`. */
  const handlerArity: Record<keyof Hooks, number> = {
    beginResolve: 2,
    beforeConstruct: 1,
    canonicalize: 2,
    afterConstruct: 2,
  };

  /**
   * Which of the two forms `hook` was written in: middleware when it owns the chain — it declares
   * more parameters than `member`'s handler form does — and a plain handler otherwise. Arity is the
   * whole discriminator, so each form is read back by assertion.
   */
  function readForm<K extends keyof Hooks>(member: K, hook: NonNullable<Behavior[K]>): { middleware: Koa<Hooks<any>[K]>; } | { handler: Hooks<any>[K]; } {
    if (hook.length > handlerArity[member]) {
      return { middleware: hook as Koa<Hooks<any>[K]> };
    }
    return { handler: hook as Hooks<any>[K] };
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

  /** `seen` as the chain beneath reads it: whatever a middleware rewrote about the node, over the states the construction arrived carrying. */
  function constructionBeneath(seen: Hooks.Construction, states: readonly unknown[]): HookChain.Construction {
    return {
      node: seen.node,
      populatedAddress: seen.populatedAddress,
      registration: seen.registration,
      states,
    };
  }

  /**
   * A handler files the state it opens under into its own slot, everything beneath having opened
   * first; middleware opens what is beneath by calling `next`, which answers back the very state it
   * was handed, no slot but this one being the middleware's to read.
   */
  function composeBeginResolve(hook: Behavior['beginResolve'], slot: number, inner: HookChain['beginResolve']): HookChain['beginResolve'] {
    if (!hook) {
      return inner;
    }
    const form = readForm('beginResolve', hook);
    if ('middleware' in form) {
      return (request, injected, opening) => {
        opening[slot] = form.middleware(request, injected[slot], (beneathRequest, threaded) => {
          inner(beneathRequest, injected, opening);
          return threaded;
        });
      };
    }
    return (request, injected, opening) => {
      inner(request, injected, opening);
      opening[slot] = form.handler(request, injected[slot]);
    };
  }

  /**
   * A `{result}` answer wins outright and nothing beneath this layer runs; a `{state}` answer is
   * filed into this behavior's own slot, which is where its dependencies read it back.
   */
  function composeBeforeConstruct(hook: Behavior['beforeConstruct'], slot: number, inner: HookChain['beforeConstruct']): HookChain['beforeConstruct'] {
    if (!hook) {
      return inner;
    }
    const form = readForm('beforeConstruct', hook);
    if ('middleware' in form) {
      return (construction, within) => {
        const answer = form.middleware(constructionForSlot(construction, slot), seen => inner(constructionBeneath(seen, construction.states), within) ?? { state: seen.state });
        if ('result' in answer) {
          return answer;
        }
        within[slot] = answer.state;
        return undefined;
      };
    }
    return (construction, within) => {
      const answer = form.handler(constructionForSlot(construction, slot));
      if ('result' in answer) {
        return answer;
      }
      within[slot] = answer.state;
      return inner(construction, within);
    };
  }

  /** A handler transforms first and hands its answer on, so the innermost layer settles the canonical instance. */
  function composeCanonicalize(hook: Behavior['canonicalize'], slot: number, inner: HookChain['canonicalize']): HookChain['canonicalize'] {
    if (!hook) {
      return inner;
    }
    const form = readForm('canonicalize', hook);
    if ('middleware' in form) {
      return (construction, instance) => form.middleware(constructionForSlot(construction, slot), instance, (seen, transformed) => inner(constructionBeneath(seen, construction.states), transformed));
    }
    return (construction, instance) => inner(construction, form.handler(constructionForSlot(construction, slot), instance));
  }

  /** A handler runs after everything downstream of it, so the innermost layer runs first and the outermost last. */
  function composeAfterConstruct(hook: Behavior['afterConstruct'], slot: number, inner: HookChain['afterConstruct']): HookChain['afterConstruct'] {
    if (!hook) {
      return inner;
    }
    const form = readForm('afterConstruct', hook);
    if ('middleware' in form) {
      return (construction, instance) => form.middleware(constructionForSlot(construction, slot), instance, (seen, settled) => inner(constructionBeneath(seen, construction.states), settled));
    }
    return (construction, instance) => {
      inner(construction, instance);
      form.handler(constructionForSlot(construction, slot), instance);
    };
  }

  /**
   * `behavior` standing over `inner`, threading its own state through `slot`: each of the four hooks
   * `behavior` wrote composes over `inner`'s own, a member it left off passing `inner`'s straight
   * through untouched.
   *
   * @remarks
   * Composing `behavior` over `inner` puts `behavior` closer to the call and `inner` further from
   * it, so stacking layers outer-to-inner over successively wider `inner`s is what nests the
   * outermost caller around everything installed before it. `slot` is `behavior`'s position in the
   * install list the chain is folded from, and the same position in the state array minted
   * alongside it.
   */
  export function compose(behavior: Behavior, slot: number, inner: HookChain): HookChain {
    return {
      beginResolve: composeBeginResolve(behavior.beginResolve, slot, inner.beginResolve),
      beforeConstruct: composeBeforeConstruct(behavior.beforeConstruct, slot, inner.beforeConstruct),
      canonicalize: composeCanonicalize(behavior.canonicalize, slot, inner.canonicalize),
      afterConstruct: composeAfterConstruct(behavior.afterConstruct, slot, inner.afterConstruct),
    };
  }
}
