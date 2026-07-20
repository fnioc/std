// The registration ABI — the plain-data shapes the registration builder
// produces and the engine consumes. Pure types: they describe the contract
// between the collection surface (`ServiceManifestClass`, di.core) and the
// resolution engine (`ServiceProviderClass`, `@rhombus-std/di`), so they live in
// the abstractions layer both sides depend on.

import type { Ctor, Func } from '@rhombus-toolkit/func';
import type { DepSlot, Token } from './types.js';

export type { Ctor };

/**
 * A registration-level factory function. Its parameters are filled by the
 * engine at resolve time, the same way a class constructor's are: each parameter
 * is resolved by its slot (token → resolved instance, provider token → the live
 * provider view, hole → caller-supplied). A factory with no signatures runs with
 * no injected args — it declares the deps it wants, nothing is auto-supplied.
 *
 * May be async — it can return a `Promise<T>`. The container never awaits; the
 * Promise flows through the sync resolution channel as a value (§"Async as
 * values"). A consumer that depends on it declares `Promise<T>` and awaits.
 */
export type Factory = Func<any[], unknown>;

/**
 * Builds an instance from its resolved positional args. The single normalized
 * form the three authoring kinds collapse into at registration time:
 *   - class   → `(...a) => new Ctor(...a)`
 *   - value   → `() => value`
 *   - factory → the factory function itself
 */
export type Producer = Func<any[], unknown>;

/**
 * A single normalized registration — ONE "producer" shape for all three
 * authoring kinds (class / value / factory). The builder wraps each into a
 * `produce` closure at registration time (see `Producer`); the engine dispatches
 * on this one shape, calling `produce(...args)` uniformly rather than switching
 * on a `kind` discriminant.
 */
export interface Registration {
  /** Builds the instance from the resolved positional args (see `Producer`). */
  readonly produce: Producer;
  /**
   * The lifetime — the scope name that owns and caches the instance. `undefined`
   * means transient (never cached; produced fresh per resolve). A value is
   * always transient: a value IS its instance, so ownership/caching is moot and
   * a value that is itself a `Promise` is returned raw, never awaited.
   */
  readonly scope: string | undefined;
  /**
   * Registration-carried dep signatures — the positional slots that feed
   * `produce`, and the sole signature channel now that the global metadata store
   * is retired. Emitted inline by the transformer (`add`/`addFactory` third arg)
   * and hand-fed by a plugin-less caller. Absent or empty means `produce` takes
   * no injected args (a zero-arg ctor, a value, or a signature-less factory).
   */
  readonly signatures?: ReadonlyArray<readonly DepSlot[]>;
  /**
   * The producer's diagnostic name — the ctor / factory name, carried EXPLICITLY
   * because a wrapper closure (`(...a) => new Ctor(...a)`) reports `""` for its
   * own `.name`. Empty string for a value. Feeds the `MissingMetadataError` /
   * `NoSatisfiableSignatureError` diagnostics.
   */
  readonly name: string;
  /**
   * The original constructor arity (`Ctor.length`), carried EXPLICITLY because a
   * rest-param wrapper reports `0` for its own `.length`. Drives the
   * missing-metadata signal: a signature-less producer whose `arity` is nonzero
   * (a class ctor that needs args) throws `MissingMetadataError`. `0` for a value
   * or a factory — a signature-less factory simply runs with no injected args.
   */
  readonly arity: number;
}

/**
 * An OPEN registration — a class bound to an open template token whose type
 * arguments are all holes (`pkg:IRepo<$1>`). It never resolves directly;
 * resolving a closed token that misses the exact map matches against these
 * (base + arity + repeated-hole equality, last registered wins), substitutes
 * the closing's arg tokens through the carried signatures, and synthesizes an
 * ordinary class `Registration` (a ctor-wrapping producer) memoized per closed
 * token.
 */
export interface OpenRegistration {
  /** The full template token as registered (`pkg:IRepo<$1>`). */
  readonly template: Token;
  /** The template's base (`pkg:IRepo`) — the open-table key. */
  readonly base: Token;
  /**
   * The parsed top-level args of the template — each exactly a hole (`$N`).
   * Length is the arity; repeated holes (`["$1","$1"]`) constrain a match to
   * equal arg tokens.
   */
  readonly pattern: readonly Token[];
  readonly ctor: Ctor;
  /** The lifetime tag, applied per closing. `undefined` means transient. */
  readonly scope: string | undefined;
  /**
   * The template dep signatures (holes and `TypeArgRef`s still open) —
   * substituted per closing. When absent, the closing has no template to
   * substitute (a zero-arg ctor closes to a bare `new Ctor()`).
   */
  readonly signatures?: ReadonlyArray<readonly DepSlot[]>;
}

/**
 * The sealed, immutable snapshot a `ServiceManifestClass` hands to the engine.
 * `ServiceManifestClass.seal()` deep-freezes its registration tables into this
 * shape; `@rhombus-std/di`'s `build()` extension reads it to construct the
 * provider (the engine-constructing half stays in the runtime package). This is
 * the seam that lets the collection live in di.core while provider construction
 * lives in di.
 */
export interface SealedManifest {
  readonly registrations: ReadonlyMap<Token, readonly Registration[]>;
  readonly openRegistrations: ReadonlyMap<Token, readonly OpenRegistration[]>;
}
