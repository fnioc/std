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

/**
 * The four handlers the engine drives, everything installed folded into one apiece.
 *
 * @remarks
 * A chain is folded from one snapshot of the install list, and every behavior in it owns the slot
 * at its own position in that list. A slot is private to its owner: the chain reads the value out,
 * hands the behavior that bare value, and files back whatever the behavior answered, so nothing
 * here lets one behavior read or overwrite another's. The slots a construction is answered under
 * are collected across the whole chain and handed back in one array, which is what the dependency
 * subtree then resolves under.
 */
export interface HookChain {
  /**
   * Opens one resolution, each behavior filing into its own slot of `opening` the state its
   * constructions start under — seeded from `injected`, so a slot whose owner writes nothing keeps
   * what it was handed.
   */
  readonly beginResolve: Func<[request: Type, injected: readonly unknown[], opening: unknown[]], void>;
  /**
   * Runs before the engine constructs, answering a result to stand in place of constructing or
   * nothing at all — each behavior having filed into `within` the state its dependencies resolve
   * under, seeded from the states the construction arrived carrying.
   */
  readonly beforeConstruct: Func<[construction: HookChain.Construction, within: unknown[]], HookChain.Interception>;
  /** Settles what the engine has just constructed, every behavior transforming outermost-first. */
  readonly canonicalize: Func<[construction: HookChain.Construction, instance: unknown], unknown>;
  /** Runs once the engine has constructed, innermost behavior first. */
  readonly afterConstruct: Func<[construction: HookChain.Construction, instance: unknown], void>;
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
    /** One slot per installed behavior, in install order. */
    readonly states: readonly unknown[];
  }

  /** What the chain answers for a construction: a result standing in place of it, or nothing at all — go ahead and construct. */
  export type Interception = { readonly result: unknown; } | undefined;

  /** The chain everything folds onto: it supplies nothing, changes nothing, and files no state. */
  export const identity: HookChain = {
    beginResolve() {},
    beforeConstruct() {
      return undefined;
    },
    canonicalize(_construction, instance) {
      return instance;
    },
    afterConstruct() {},
  };
}
