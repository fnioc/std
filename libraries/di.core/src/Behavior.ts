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
 * beneath it run by calling it. Form is chosen by arity — a hook declaring more parameters than its
 * handler form is middleware.
 *
 * For a plain handler, the layer farthest from the engine applies last and so holds final
 * authority over the outcome. The middleware form exists to override that: declaring the trailing
 * `next` encloses every layer nearer the engine that would otherwise outrank it, so it can pre-empt
 * them outright or rewrite what they already answered before its own answer stands.
 *
 * State is threaded through a slot of this behavior's own, private to it for as long as the install
 * lives: a hook is handed that slot's bare value and what it answers goes straight back into that
 * slot, so no state another behavior threads is reachable from here and none of this one's is
 * reachable from there. What a middleware's `next` answers therefore carries the outcome alone — a
 * result standing in place of the construction, or the very state the middleware handed it, meaning
 * everything beneath ran and had nothing to report.
 *
 * Installing a behavior chains each hook it wrote over the behaviors already installed, nearest the
 * engine, and leaves the hooks it wrote none of untouched. A standalone implementation of one
 * member on its own, predefined before it's assigned, is typed by indexed access —
 * `Behavior['beforeConstruct']`.
 *
 * @typeParam State - the shape of the state these handlers thread through a resolution.
 */
export type Behavior<State = any> = {
  readonly [K in keyof Hooks<State>]?: Hooks<State>[K] | Koa<Hooks<State>[K]>;
};
