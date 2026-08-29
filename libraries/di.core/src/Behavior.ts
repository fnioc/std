import type { Func } from '@rhombus-toolkit/func';
import type { Hooks } from './hooks.js';

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
 * A resolution folds the behaviors accompanying it into one {@link Hooks}, the first behavior
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
  /** Whether `hook` was written as middleware: it owns the chain when it declares more parameters than the handler form does. */
  function ownsChain<Handler extends (...args: any[]) => any, Middleware extends (...args: any[]) => any>(hook: Handler | Middleware, handlerArity: number): hook is Middleware {
    return hook.length > handlerArity;
  }

  /** A handler transforms the injection `next` answered. */
  function byBeginResolveHandler(handler: Hooks['beginResolve'], next: Hooks['beginResolve']): Hooks['beginResolve'] {
    return (request, injected) => handler(request, next(request, injected));
  }

  /** A handler's own `{result}` answer wins outright; its `{state}` re-threads the construction `next` then sees. */
  function byBeforeConstructHandler(handler: Hooks['beforeConstruct'], next: Hooks['beforeConstruct']): Hooks['beforeConstruct'] {
    return construction => {
      const answer = handler(construction);
      if ('result' in answer) {
        return answer;
      }
      return next({ ...construction, state: answer.state });
    };
  }

  /** A handler transforms first and hands its answer on, so the innermost layer settles the canonical instance. */
  function byCanonicalizeHandler(handler: Hooks['canonicalize'], next: Hooks['canonicalize']): Hooks['canonicalize'] {
    return (construction, instance) => next(construction, handler(construction, instance));
  }

  /** A handler runs after everything downstream of it, so the innermost layer runs first and the outermost last. */
  function byAfterConstructHandler(handler: Hooks['afterConstruct'], next: Hooks['afterConstruct']): Hooks['afterConstruct'] {
    return (construction, instance) => {
      next(construction, instance);
      handler(construction, instance);
    };
  }

  /**
   * `hook` standing over `next`, for one hook member: absent, `next` passes straight through;
   * middleware runs in `next`'s own place and calls it itself; a handler is combined with `next` by
   * `byHandler`, the one piece particular to each of the four hooks.
   */
  function composeMember<Args extends readonly unknown[], Answer>(
    hook: (Func<Args, Answer> | Koa<Func<Args, Answer>>) | undefined,
    next: Func<Args, Answer>,
    byHandler: (handler: Func<Args, Answer>, next: Func<Args, Answer>) => Func<Args, Answer>,
  ): Func<Args, Answer> {
    if (!hook) {
      return next;
    }
    if (ownsChain<Func<Args, Answer>, Koa<Func<Args, Answer>>>(hook, next.length)) {
      return (...args: Args) => hook(...args, next);
    }
    return byHandler(hook, next);
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
      beginResolve: composeMember(behavior.beginResolve, inner.beginResolve, byBeginResolveHandler),
      beforeConstruct: composeMember(behavior.beforeConstruct, inner.beforeConstruct, byBeforeConstructHandler),
      canonicalize: composeMember(behavior.canonicalize, inner.canonicalize, byCanonicalizeHandler),
      afterConstruct: composeMember(behavior.afterConstruct, inner.afterConstruct, byAfterConstructHandler),
    };
  }
}
