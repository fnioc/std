// The registration ABI — the plain-data shapes the registration builder
// produces and the resolution engine consumes.

import type { Ctor, Func } from '@rhombus-toolkit/func';
import type { TokenNode } from './token/index.js';
import type { DepSignatures, Token } from './types.js';

export type { Ctor };

/**
 * A registration-level factory function. Its parameters are filled at resolve
 * time the same way a class constructor's are: each parameter is resolved by its
 * slot (token → resolved instance, provider token → the live provider view, hole
 * → caller-supplied). A factory with no signatures runs with no injected args.
 *
 * @remarks
 * May be async. The container never awaits: a returned `Promise<T>` flows
 * through the sync resolution channel as a value, and a consumer that depends on
 * it declares `Promise<T>` and awaits.
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
 * A single normalized registration — ONE `produce` shape for all three authoring
 * kinds (class / value / factory), so resolution calls `produce(...args)`
 * uniformly with no kind discriminant to switch on.
 */
export interface Registration {
  /** Builds the instance from the resolved positional args. */
  readonly produce: Producer;
  /**
   * The scope name that owns and caches the instance. `undefined` means
   * transient (never cached; produced fresh per resolve). A value is always
   * transient: a value IS its instance, so ownership is moot and a value that is
   * itself a `Promise` is returned raw, never awaited.
   */
  readonly scope: string | undefined;
  /**
   * The positional slots that feed `produce`, and the sole signature channel.
   * Absent or empty means `produce` takes no injected args (a zero-arg ctor, a
   * value, or a signature-less factory).
   */
  readonly signatures?: DepSignatures;
  /**
   * The producer's diagnostic name — the ctor / factory name, carried EXPLICITLY
   * because a wrapper closure (`(...a) => new Ctor(...a)`) reports `""` for its
   * own `.name`. Empty string for a value. Feeds the `MissingMetadataError` /
   * `NoSatisfiableSignatureError` diagnostics.
   */
  readonly name: string;
  /**
   * The producer's declared parameter count, carried EXPLICITLY because the
   * ctor-wrapping closure (`(...a) => new Ctor(...a)`) reports `0` for its own
   * `.length`: a class carries `Ctor.length`, a factory carries `factory.length`.
   * Drives the missing-metadata signal — a signature-less producer with a
   * nonzero `arity` throws `MissingMetadataError`. `0` for a value.
   */
  readonly arity: number;
}

/**
 * An OPEN registration — a class bound to a template token carrying a hole in
 * some type-argument position at some depth (`pkg:IRepo<$1>`,
 * `pkg:IRepo<pkg:IUser,$1>`, `pkg:IRepo<app/IBox<$1>>`).
 *
 * @remarks
 * It never resolves directly. Resolving a closed token that misses the exact map
 * unifies it against these (base + key + arity, then per-arg: a concrete arg
 * must match exactly, a hole binds, a repeated hole label must bind equal),
 * substitutes the binding through the carried signatures, and synthesizes an
 * ordinary class `Registration` memoized per closed token. Templates overlapping
 * on one base are tried MOST-SPECIFIC-FIRST, ties to the latest registered.
 */
export interface OpenRegistration {
  /** The full template token as registered (`pkg:IRepo<$1>`). */
  readonly template: Token;
  /** The template's canonical base + key (`pkg:IRepo`) — the open-table key. */
  readonly base: Token;
  readonly ctor: Ctor;
  /** The lifetime tag, applied per closing. `undefined` means transient. */
  readonly scope: string | undefined;
  /**
   * The template dep signatures (holes and `TypeArgRef`s still open) —
   * substituted per closing. When absent, the closing has no template to
   * substitute (a zero-arg ctor closes to a bare `new Ctor()`).
   */
  readonly signatures?: DepSignatures;
  /**
   * The parsed template tree a closed ground token is unified against.
   * OPTIONAL so hand-built `OpenRegistration` literals stay valid; resolution
   * falls back to `tryParse(template)` when it is absent.
   */
  readonly node?: TokenNode;
}

/**
 * ONE registration as it comes out of a manifest's iteration. A manifest is an
 * `Iterable<ManifestEntry>` — the decorator CHAIN yields its predecessor's
 * entries first, then its own — so the entry stream IS the manifest's ordered
 * source of truth.
 *
 * @remarks
 * Entries are FROZEN and never refined in place: a modifier (`as` / `withKey` /
 * `withSignature` / `withSignatures`) builds a whole new node carrying a freshly
 * materialised entry over the SAME predecessor, so one `.addClass(...).as(...)`
 * chain contributes exactly one entry (a spurious shadow would pollute
 * collection aggregation, which enumerates every registration of a token).
 */
export type ManifestEntry = { readonly kind: 'exact'; readonly token: Token; readonly registration: Registration; } | {
  readonly kind: 'open';
  readonly base: Token;
  readonly open: OpenRegistration;
};

/**
 * The sealed, immutable snapshot a manifest hands to the engine: each per-token
 * list is frozen, but the Maps are read-only by TYPE only, since `Object.freeze`
 * does not seal a Map's entry slots.
 */
export interface SealedManifest {
  readonly registrations: ReadonlyMap<Token, readonly Registration[]>;
  readonly openRegistrations: ReadonlyMap<Token, readonly OpenRegistration[]>;
}
