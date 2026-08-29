import type { Type } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';
import type { Registration } from './Registration/index.js';

/**
 * The four handlers the engine holds, one apiece and every one of them present: whatever was
 * registered is composed into these before the engine ever sees it.
 *
 * @remarks
 * A standalone implementation of one member on its own, predefined before it's assigned, is typed
 * by indexed access — `Hooks['beginResolve']`.
 *
 * @typeParam State - the shape of the state they thread through a resolution.
 */
export interface Hooks<State = unknown> {
  /** Opens one resolution, answering the state its constructions start under. */
  readonly beginResolve: Func<[request: Type, injected: State], State>;
  /** Runs before the engine constructs, answering a result in place of constructing or the state the dependencies resolve under. */
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
   */
  readonly canonicalize: Func<[construction: Hooks.Construction<State>, instance: unknown], unknown>;
  /** Runs once the engine has constructed, on the instance as it stands — never awaited, never unwrapped. */
  readonly afterConstruct: Func<[construction: Hooks.Construction<State>, instance: unknown], void>;
}

export namespace Hooks {
  /**
   * One construction the engine is performing.
   *
   * @typeParam State - the shape of the state these handlers thread through a resolution.
   */
  export interface Construction<State = unknown> {
    /** This node's position in the resolution: one per node, referentially stable, opaque. */
    readonly site: object;
    /** The address this site answers, as it was requested, with any captures filled in. */
    readonly populatedAddress: Type;
    /** The registration that matched, absent when the engine rather than the manifest is answering. */
    readonly registration?: Registration<unknown>;
    /** The state the enclosing construction placed this one under — never this node's own answer. */
    readonly state: State;
  }

  /** What a pre-construction handler answers: a result in place of constructing, or the state this construction's dependencies resolve under — `undefined` placing them under none. */
  export type Interception<State = unknown> =
    | { readonly result: unknown; }
    | { readonly state: State | undefined; };

  /** The chain everything starts from: it supplies nothing, changes nothing, and passes the state straight through. */
  export const identity: Hooks = {
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
}
