import type { Type } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';
import type { Hooks } from './hooks.js';

/**
 * One contribution to what a resolution runs through: any of the four hooks, none of them required.
 *
 * @remarks
 * Every member takes either a plain handler or middleware for that hook — the middleware form is
 * the same signature with a trailing `next`, everything composed beneath it, and a handler simply
 * leaves that parameter off. The two are told apart by how many parameters the function declares,
 * so middleware has to declare all of them, `next` included.
 *
 * A resolution folds the behaviors accompanying it into one {@link Hooks}, the first behavior
 * innermost, and the container's own behaviors wrap the result. A standalone implementation of one
 * member on its own, predefined before it's assigned, is typed by indexed access —
 * `Behavior['beforeConstruct']`.
 *
 * @typeParam State - the shape of the state these handlers thread through a resolution.
 */
export interface Behavior<State = any> {
  /** Opens one resolution, answering the state its constructions start under. */
  readonly beginResolve?:
    | Hooks<State>['beginResolve']
    | Func<[request: Type, injected: State, next: Hooks<State>['beginResolve']], State>;
  /** Runs before the engine constructs, answering a result in place of constructing or the state the dependencies resolve under. */
  readonly beforeConstruct?:
    | Hooks<State>['beforeConstruct']
    | Func<[construction: Hooks.Construction<State>, next: Hooks<State>['beforeConstruct']], Hooks.Interception<State>>;
  /**
   * Swaps the instance the engine has just constructed for the one this handler answers — a proxy, a
   * frozen copy, a decorator — everything downstream reading what it returns.
   *
   * @remarks
   * Runs only where the engine BUILT: a beforeConstruct that supplied a result skips it entirely. The
   * engine hands over the raw product and takes back whatever is answered: it never tests for a
   * thenable, never awaits, and never unwraps, so a construction that produced a pending promise
   * arrives here as that promise.
   */
  readonly canonicalize?:
    | Hooks<State>['canonicalize']
    | Func<[construction: Hooks.Construction<State>, instance: unknown, next: Hooks<State>['canonicalize']], unknown>;
  /** Runs once the engine has constructed, on the instance as it stands — never awaited, never unwrapped. */
  readonly afterConstruct?:
    | Hooks<State>['afterConstruct']
    | Func<[construction: Hooks.Construction<State>, instance: unknown, next: Hooks<State>['afterConstruct']], void>;
}

export namespace Behavior {
  /** Whether `hook` was written as middleware: it owns the chain when it declares more parameters than the handler form does. */
  function ownsChain(hook: Func, handlerArity: number): boolean {
    return hook.length > handlerArity;
  }

  /** Middleware runs in place of `next` and calls it itself; a handler transforms the injection `next` answered. */
  function composeBeginResolve(hook: Func, next: Hooks['beginResolve']): Hooks['beginResolve'] {
    if (ownsChain(hook, 2)) {
      const middleware = hook as Func<[request: Type, injected: unknown, next: Hooks['beginResolve']], unknown>;
      return function beginResolve(request, injected) {
        return middleware(request, injected, next);
      };
    }
    const handler = hook as Hooks['beginResolve'];
    return function beginResolve(request, injected) {
      return handler(request, next(request, injected));
    };
  }

  /** A handler's own `{result}` answer wins outright; its `{state}` re-threads the construction `next` then sees. */
  function composeBeforeConstruct(hook: Func, next: Hooks['beforeConstruct']): Hooks['beforeConstruct'] {
    if (ownsChain(hook, 1)) {
      const middleware = hook as Func<[construction: Hooks.Construction, next: Hooks['beforeConstruct']], Hooks.Interception>;
      return function beforeConstruct(construction) {
        return middleware(construction, next);
      };
    }
    const handler = hook as Hooks['beforeConstruct'];
    return function beforeConstruct(construction) {
      const answer = handler(construction);
      if ('result' in answer) {
        return answer;
      }
      return next({ ...construction, state: answer.state });
    };
  }

  /** A handler transforms first and hands its answer on, so the innermost layer settles the canonical instance. */
  function composeCanonicalize(hook: Func, next: Hooks['canonicalize']): Hooks['canonicalize'] {
    if (ownsChain(hook, 2)) {
      const middleware = hook as Func<[construction: Hooks.Construction, instance: unknown, next: Hooks['canonicalize']], unknown>;
      return function canonicalize(construction, instance) {
        return middleware(construction, instance, next);
      };
    }
    const handler = hook as Hooks['canonicalize'];
    return function canonicalize(construction, instance) {
      return next(construction, handler(construction, instance));
    };
  }

  /** A handler runs after everything downstream of it, so the innermost layer runs first and the outermost last. */
  function composeAfterConstruct(hook: Func, next: Hooks['afterConstruct']): Hooks['afterConstruct'] {
    if (ownsChain(hook, 2)) {
      const middleware = hook as Func<[construction: Hooks.Construction, instance: unknown, next: Hooks['afterConstruct']], void>;
      return function afterConstruct(construction, instance) {
        middleware(construction, instance, next);
      };
    }
    const handler = hook as Hooks['afterConstruct'];
    return function afterConstruct(construction, instance) {
      next(construction, instance);
      handler(construction, instance);
    };
  }

  /**
   * `behavior` standing over `inner`: each of the four hooks `behavior` wrote composes over
   * `inner`'s own, a member it left off passes `inner`'s straight through untouched.
   *
   * @remarks
   * A composed hook is told middleware from handler by arity alone — middleware declares a
   * trailing `next` and is called in `next`'s own place, running everything beneath it itself;
   * a handler has no `next` parameter and instead transforms what calling `inner` already
   * answered. Composing `behavior` over `inner` puts `behavior` closer to the call and `inner`
   * further from it, so stacking layers outer-to-inner over successively wider `inner`s is what
   * nests the outermost caller around everything installed before it.
   */
  export function compose(behavior: Behavior, inner: Hooks): Hooks {
    return {
      beginResolve: behavior.beginResolve ? composeBeginResolve(behavior.beginResolve as Func, inner.beginResolve) : inner.beginResolve,
      beforeConstruct: behavior.beforeConstruct ? composeBeforeConstruct(behavior.beforeConstruct as Func, inner.beforeConstruct) : inner.beforeConstruct,
      canonicalize: behavior.canonicalize ? composeCanonicalize(behavior.canonicalize as Func, inner.canonicalize) : inner.canonicalize,
      afterConstruct: behavior.afterConstruct ? composeAfterConstruct(behavior.afterConstruct as Func, inner.afterConstruct) : inner.afterConstruct,
    };
  }
}
