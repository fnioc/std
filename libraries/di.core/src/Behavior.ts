import type { Func } from '@rhombus-toolkit/types';
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
 * beneath it run by calling it. Form is chosen by arity — a hook declaring more parameters than its
 * handler form is middleware.
 *
 * State is this behavior's own: a hook is handed the bare value and what it answers goes straight
 * back, so no state another behavior threads is reachable from here and none of this one's is
 * reachable from there. What a middleware's `next` answers therefore carries the outcome alone — a
 * result standing in place of the construction, or the very state the middleware handed it, meaning
 * everything beneath ran and had nothing to report.
 *
 * A standalone implementation of one member on its own, predefined before it's assigned, is typed
 * by indexed access — `Behavior['beforeConstruct']`.
 *
 * @typeParam State - the shape of the state these handlers thread through a resolution.
 */
export type Behavior<State = any> = {
  readonly [K in keyof Hooks<State>]?: Hooks<State>[K] | Koa<Hooks<State>[K]>;
};
