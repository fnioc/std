import type { Type } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';
import type { Registration } from './Registration/index.js';

/**
 * The four handlers one behavior contributes, every one of them present — a `Behavior` is the same
 * four with each of them optional.
 *
 * @remarks
 * A standalone implementation of one member on its own, predefined before it's assigned, is typed
 * by indexed access — `Hooks['beginResolve']`.
 *
 * @typeParam State - the shape of the state it threads through a resolution.
 */
export interface Hooks<State = unknown> {
  /**
   * Opens one resolution, answering the state its constructions start under.
   *
   * @remarks
   * Declared with a third `next` parameter, this hook runs as middleware; with two, as a plain
   * handler.
   */
  readonly beginResolve: Func<[request: Type, injected: State], State>;
  /**
   * Runs before the engine constructs, answering a result in place of constructing or the state the dependencies resolve under.
   *
   * @remarks
   * A plain handler farthest from the engine is asked first: if it answers a result, nothing
   * nearer the engine ever runs, so the farthest install that chooses to intercept always wins.
   *
   * Declared with a second `next` parameter, this hook runs as middleware; with one, as a plain
   * handler.
   */
  readonly beforeConstruct: Func<[construction: Hooks.Construction<State>], Hooks.Interception<State>>;
  /**
   * Swaps the instance the engine has just constructed for the one this hook answers — a proxy, a
   * frozen copy, a decorator — everything downstream reading what it returns.
   *
   * @remarks
   * Runs only where the engine BUILT: a beforeConstruct that supplied a result skips it entirely. The
   * engine hands over the raw product and takes back whatever is answered: it never tests for a
   * thenable, never awaits, and never unwraps, so a construction that produced a pending promise
   * arrives here as that promise.
   *
   * Declared with a third `next` parameter, this hook runs as middleware; with two, as a plain
   * handler.
   */
  readonly canonicalize: Func<[construction: Hooks.Construction<State>, instance: unknown], unknown>;
  /**
   * Runs once the engine has constructed, on the instance as it stands — never awaited, never unwrapped.
   *
   * @remarks
   * Declared with a third `next` parameter, this hook runs as middleware; with two, as a plain
   * handler.
   */
  readonly afterConstruct: Func<[construction: Hooks.Construction<State>, instance: unknown], void>;
}

export namespace Hooks {
  /**
   * One construction the engine is performing, as one behavior sees it.
   *
   * @typeParam State - the shape of the state these handlers thread through a resolution.
   */
  export interface Construction<State = unknown> {
    /** This node's position in the resolution: one per node, referentially stable, opaque. */
    readonly node: object;
    /** The address this node answers, as it was requested, with any captures filled in. */
    readonly populatedAddress: Type;
    /** The registration that matched, absent when the engine rather than the manifest is answering. */
    readonly registration?: Registration<unknown>;
    /** This behavior's own state, as the enclosing construction left it — never this node's own answer, and never anyone else's. */
    readonly state: State;
  }

  /** What a pre-construction handler answers: a result in place of constructing, or the state this construction's dependencies resolve under — `undefined` placing them under none. */
  export type Interception<State = unknown> =
    | { readonly result: unknown; }
    | { readonly state: State | undefined; };
}
