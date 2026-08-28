import type { Type } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';
import type { Registration } from './Registration/index.js';

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

export type BeginResolveHandler<State = unknown> = Func<[request: Type, injected: State], State>;

export type BeginResolveMiddleware<State = unknown> = Func<[request: Type, injected: State, next: BeginResolveHandler<State>], State>;

export type BeforeConstructHandler<State = unknown> = Func<[construction: Construction<State>], Interception<State>>;

export type BeforeConstructMiddleware<State = unknown> = Func<
  [construction: Construction<State>, next: BeforeConstructHandler<State>],
  Interception<State>
>;

export type CanonicalizeHandler<State = unknown> = Func<[construction: Construction<State>, instance: unknown], unknown>;

export type CanonicalizeMiddleware<State = unknown> = Func<
  [construction: Construction<State>, instance: unknown, next: CanonicalizeHandler<State>],
  unknown
>;

export type AfterConstructHandler<State = unknown> = Func<[construction: Construction<State>, instance: unknown], void>;

export type AfterConstructMiddleware<State = unknown> = Func<
  [construction: Construction<State>, instance: unknown, next: AfterConstructHandler<State>],
  void
>;

/**
 * The four handlers the engine holds, one apiece and every one of them present: whatever was
 * registered is composed into these before the engine ever sees it.
 *
 * @typeParam State - the shape of the state they thread through a resolution.
 */
export interface Hooks<State = unknown> {
  /** Opens one resolution, answering the state its constructions start under. */
  readonly beginResolve: BeginResolveHandler<State>;
  /** Runs before the engine constructs, answering a result in place of constructing or the state the dependencies resolve under. */
  readonly beforeConstruct: BeforeConstructHandler<State>;
  /** Swaps the instance the engine has just constructed for the one this hook answers — a proxy, a frozen copy, a decorator — everything downstream reading what it returns. */
  readonly canonicalize: CanonicalizeHandler<State>;
  /** Runs once the engine has constructed, on the instance as it stands — never awaited, never unwrapped. */
  readonly afterConstruct: AfterConstructHandler<State>;
}

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
 * innermost, and the container's own behaviors wrap the result.
 *
 * @typeParam State - the shape of the state these handlers thread through a resolution.
 */
export interface Behavior<State = any> {
  /** Opens one resolution, answering the state its constructions start under. */
  readonly beginResolve?: BeginResolveMiddleware<State>;
  /** Runs before the engine constructs, answering a result in place of constructing or the state the dependencies resolve under. */
  readonly beforeConstruct?: BeforeConstructMiddleware<State>;
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
  readonly canonicalize?: CanonicalizeMiddleware<State>;
  /** Runs once the engine has constructed, on the instance as it stands — never awaited, never unwrapped. */
  readonly afterConstruct?: AfterConstructMiddleware<State>;
}
