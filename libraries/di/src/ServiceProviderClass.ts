// The scope frame + the resolution engine.
//
// THE CRITICAL CORRECTNESS RULE: on a cache miss the instance is constructed by
// resolving ITS constructor dependencies relative to the OWNING scope (the
// matched frame), never the scope that triggered the resolve. That is what keeps
// a long-lived service from silently capturing a shorter-lived one's cached
// instance — when no matching frame encloses the owner, the dep resolves
// transiently (a fresh instance) instead.

import { AsyncDisposalRequiredError, AsyncResolutionRequiredError, CircularDependencyError, closeSignatures, closeToken,
  type DepSlot, type FactoryRef, FactoryTargetError, isFactoryRef, isLiteralRef, isOpenToken, isProviderToken,
  isTypeArgRef, isUnionSlot, type LiteralRef, Matcher, MissingMetadataError, NoSatisfiableSignatureError,
  NoSatisfiableUnionError, OpenTokenResolutionError, ProviderDisposedError, RegistrationValidationError,
  ScopeValidationError, type ServiceProviderOptions, Specificity, type Token, TokenNode, type TypeArgRef, type Union,
  unkeyedToken, UnregisteredTokenError } from '@rhombus-std/di.core';
import type { Func } from '@rhombus-toolkit/func';

import type { IResolver, IScopeFactory, IServiceProvider, OpenRegistration, Registration } from './types.js';

/**
 * The one directional-unification op the open-generic close path drives.
 * Stateless (each `match` starts from a fresh binding map), so a single
 * module-level instance serves every provider.
 */
const MATCHER = new Matcher();

/**
 * The most-specific-wins metric behind `rankTemplates`. Stateful only WITHIN one
 * `measure` call (it resets its own hole tally), so one module-level instance
 * serves every provider.
 */
const SPECIFICITY = new Specificity();

interface RankedTemplate {
  readonly template: TokenNode;
  readonly open: OpenRegistration;
}

/**
 * Orders the open templates bucketed under one base MOST-SPECIFIC FIRST, ties
 * broken by LATEST registration (bucket order is registration order). A template
 * that does not parse is simply not a candidate.
 */
function rankTemplates(candidates: readonly OpenRegistration[]): RankedTemplate[] {
  const ranked: Array<RankedTemplate & { readonly index: number; readonly score: number; }> = [];
  for (let i = 0; i < candidates.length; i++) {
    const open = candidates[i]!;
    const template = open.node ?? TokenNode.tryParse(open.template);
    if (template === undefined) {
      continue;
    }
    ranked.push({ template, open, index: i, score: SPECIFICITY.measure(template) });
  }
  ranked.sort((a, b) => b.score - a.score || b.index - a.index);
  return ranked;
}

/** The shared empty closing list — the miss result of `#closings`, never
 * memoized (misses are unbounded, so caching them would grow the memo without
 * limit). */
const NO_CLOSINGS: readonly Registration[] = Object.freeze([]);

function isDisposable(value: unknown): value is Disposable {
  return (value != null
    && (typeof value === 'object' || typeof value === 'function')
    && typeof (value as { [Symbol.dispose]?: unknown; })[Symbol.dispose] === 'function');
}

function isAsyncDisposable(value: unknown): value is AsyncDisposable {
  return (value != null
    && (typeof value === 'object' || typeof value === 'function')
    && typeof (value as { [Symbol.asyncDispose]?: unknown; })[Symbol.asyncDispose] === 'function');
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (value != null
    && (typeof value === 'object' || typeof value === 'function')
    && typeof (value as { then?: unknown; }).then === 'function');
}

/**
 * The private carrier for an in-flight async resolution. Wrapping (instead of
 * passing a raw Promise) is what lets the resolver stay free of thenable
 * sniffing: a raw Promise flowing through resolution is always an honest VALUE
 * (a `Promise<X>` registration); a `Pending` is always the engine's own "not
 * settled yet" marker. Never escapes the public API.
 */
class Pending<T> {
  public constructor(public readonly promise: Promise<T>) {}
}

function isPending<T>(value: T | Pending<T>): value is Pending<T> {
  return value instanceof Pending;
}

/**
 * Collapses a spine result to a Promise. The return is `Promise<Awaited<T>>`,
 * not `Promise<T>` — honest about promise auto-flattening, which is what makes
 * the `Promise<T>` fallback deliver `T` on await. Both branches route through
 * one `Promise.resolve` so the already-a-promise branch typechecks against that
 * return; a naive ternary does not (`T` is not assignable to `Awaited<T>`).
 */
function settle<T>(result: T | Pending<T>): Promise<Awaited<T>> {
  return Promise.resolve(isPending(result) ? result.promise : result);
}

function rawTypeArgError(slot: TypeArgRef): TypeError {
  return new TypeError(
    `Raw TypeArgRef slot { typeArg: ${slot.typeArg} } reached resolution — `
      + `an open template's signature was used without substitution. Resolve a `
      + `closed token so the engine can close the template, or substitute the `
      + `signatures before hand-feeding them.`,
  );
}

/**
 * The string-token members of a `Union`, recursing into nested unions — what a
 * fully-unsatisfiable union slot needs registered. Non-token members contribute
 * nothing.
 */
function* unionTokenMembers(slot: Union): Generator<Token> {
  for (const member of slot.union) {
    if (typeof member === 'string') {
      yield member;
    } else if (isUnionSlot(member)) {
      yield* unionTokenMembers(member);
    }
  }
}

/**
 * Orders signatures longest → shortest with a STABLE tie-break: equal-arity
 * signatures keep their registration order.
 */
function orderByArityDesc(signatures: ReadonlyArray<readonly DepSlot[]>): ReadonlyArray<readonly DepSlot[]> {
  return signatures.map((sig, index) => ({ sig, index })).sort((a, b) =>
    b.sig.length !== a.sig.length ? b.sig.length - a.sig.length : a.index - b.index
  ).map(({ sig }) => sig);
}

// ── Collection resolution ────────────────────────────────────────────────────

/**
 * The wrapper bases a collection resolution recognizes. `Array<T>` is the token
 * derived for BOTH `T[]` and `Array<T>`; `Iterable<T>` is its lazy sibling. The
 * form is the plain closed generic `base<elementToken>` — the same string a
 * manual `add("Array<pkg:IFoo>", …)` writes.
 */
const ARRAY_TOKEN_BASE = 'Array';
const ITERABLE_TOKEN_BASE = 'Iterable';

/**
 * The separator between a base token and its resolution KEY. A keyed
 * registration lives under the ORDINARY token `base + "#" + key` — service
 * identity is already a token string, and a key is just a `"#<key>"` suffix on
 * it, so exact keyed resolution needs no separate engine.
 */
const KEY_SEPARATOR = '#';

/**
 * Composes the lookup token for a SINGULAR keyed resolve. The empty key (the
 * single-argument `resolve(token)` default) is the bare, non-keyed token.
 */
function composeKeyed(base: Token, key: string): Token {
  return key === '' ? base : base + KEY_SEPARATOR + key;
}

interface CollectionRequest {
  readonly base: typeof ARRAY_TOKEN_BASE | typeof ITERABLE_TOKEN_BASE;
  readonly element: Token;
}

/**
 * Recognizes a collection wrapper token — `Array<T>` or `Iterable<T>` — and
 * returns its base and element token, or `undefined` for any other token. An
 * open-template element (`Array<$1>`) is NOT a collection request; it is an
 * open-registration key, so a holey element is rejected here.
 */
function collectionRequest(token: Token): CollectionRequest | undefined {
  const parsed = TokenNode.tryParse(token);
  if (parsed === undefined
    || parsed.kind !== 'concrete'
    || parsed.key !== undefined
    || parsed.args.length !== 1
    || (parsed.base !== ARRAY_TOKEN_BASE && parsed.base !== ITERABLE_TOKEN_BASE))
  {
    return undefined;
  }
  // The element is the canonical serialisation of the parsed arg.
  const arg = parsed.args[0]!;
  if (TokenNode.isOpen(arg)) {
    return undefined;
  }
  return { base: parsed.base, element: TokenNode.toString(arg) };
}

/**
 * Wraps a resolved aggregate in the requested container. `Array<T>` yields a
 * fresh mutable array; `Iterable<T>` a re-iterable generator-backed view,
 * distinct from an array so the requested container type is honored.
 */
function wrapCollection(base: CollectionRequest['base'], items: readonly unknown[]): unknown {
  if (base === ARRAY_TOKEN_BASE) {
    return [...items];
  }
  return { *[Symbol.iterator](): Iterator<unknown> {
    yield* items;
  } };
}

/**
 * The nearest enclosing OWNED construction — set when the spine constructs an
 * instance that a frame will cache, and threaded down that construction's
 * dependency resolutions. When `validateScopes` trips on a tagged dep with no
 * owner frame, the captor names WHO would capture the fresh transient.
 */
interface Captor {
  /** The owned instance's token. */
  readonly token: Token;
  /** The scope name of the frame that owns (caches) it. */
  readonly scope: string;
}

/**
 * Disposal failure policy: every owned instance's disposal is ATTEMPTED (a
 * throwing disposable never aborts its siblings' teardown); afterwards a single
 * collected failure rethrows as itself, and two or more aggregate into one
 * `AggregateError`.
 */
function throwDisposalFailures(failures: readonly unknown[]): void {
  if (!failures.length) {
    return;
  }
  if (failures.length === 1) {
    throw failures[0];
  }
  throw new AggregateError(failures, 'One or more errors occurred while disposing the service provider.');
}

/**
 * A scope frame — a node in the parent-linked chain. Holds this scope's name,
 * its instance cache, an ordered list for disposal, and an optional parent.
 * It does NOT hold registrations (those live sealed on the IServiceProvider).
 *
 * A `IServiceProvider` with "no frame" resolves everything transiently — a
 * tagged registration whose frame is not open resolves to a fresh instance,
 * exactly like an untagged (transient) one. Frames are opened with
 * `createScope(name)`, never auto-created.
 *
 * INTERNAL — never exported from the package barrel. A consumer holds only the
 * `IServiceProvider` interface a frame backs, never the frame itself.
 */
class Scope {
  /**
   * Instances this scope owns and caches, keyed by the REGISTRATION object (not
   * the token). Keying on the registration is what lets the N accumulated
   * registrations of one token cache independently — a collection resolution
   * builds each element against its own registration's slot, while bare-T
   * resolution and the aggregate's last element share the last registration's.
   */
  readonly cache: Map<Registration, unknown> = new Map();

  /** Owned instances in construction order — disposed in reverse. */
  readonly owned: unknown[] = [];

  /**
   * Set when the provider that opened this frame closed it. Disposal does NOT
   * cascade to child scopes, so a child outlives its parent's frame and would
   * otherwise keep caching into it — the flag is what lets `#resolveWith` refuse
   * a CLOSED owner rather than own an instance nothing will ever drain.
   */
  disposed = false;

  public constructor(
    /** This scope's name — must match the registration's lifetime tag. */
    public readonly name: string,
    /** The parent scope, or omitted for the topmost frame. */
    public readonly parent?: Scope,
  ) {}
}

/**
 * The concrete container IMPLEMENTATION behind the public `IServiceProvider`
 * interface (`@rhombus-std/di.core`). Consumers hold the interface (what
 * `build()` / `createScope()` return), never this class.
 *
 * `S` is the user-declared scope-name union. The provider `ServiceManifest.build()`
 * returns is FRAMELESS — there is no root scope. With no frame open, every
 * resolution is transient; opening a scope with `createScope(name)` is what
 * lets a registration tagged with that name cache. "singleton" is not special —
 * it is just a tag you typically open once at the top via
 * `createScope("singleton")`.
 */
export class ServiceProviderClass<S extends string = string> implements IServiceProvider<S> {
  #disposed = false;

  /**
   * The scope frame for this provider. `undefined` means this provider has no
   * open scope — the frameless provider `build()` returns, where every
   * resolution is transient until a scope is opened with `createScope`.
   */
  readonly #frame: Scope | undefined;

  /** The sealed registration map (shared across all providers in the tree). */
  readonly #registrations: ReadonlyMap<Token, Registration[]>;

  /** The sealed OPEN-registration table (shared across the tree), keyed by base. */
  readonly #openRegistrations: ReadonlyMap<Token, readonly OpenRegistration[]>;

  /**
   * The memo of registrations synthesized from open matches, keyed by closed
   * token — the FULL ranked closing list per token, since a closed token may be
   * covered by several overlapping templates and a collection resolution wants
   * them all. Deliberately MUTABLE and shared across ALL providers of one tree
   * (`build()` creates it once and every `createScope` passes the same Map), so
   * a closing resolved in one frame reuses the identical Registration object
   * everywhere. The sealed maps are never touched.
   */
  readonly #closedMemo: Map<Token, readonly Registration[]>;

  /**
   * The provider options, shared across the tree — `#childScope` passes the same
   * object to every descendant. `undefined` means the defaults: no validation.
   */
  readonly #options: ServiceProviderOptions | undefined;

  public constructor(
    registrations: ReadonlyMap<Token, Registration[]>,
    openRegistrations: ReadonlyMap<Token, readonly OpenRegistration[]>,
    closedMemo: Map<Token, readonly Registration[]>,
    /** This provider's scope frame, if any. */
    frame?: Scope,
    /** The provider's validation options; omitted ⇒ no validation. */
    options?: ServiceProviderOptions,
  ) {
    this.#registrations = registrations;
    this.#openRegistrations = openRegistrations;
    this.#closedMemo = closedMemo;
    this.#frame = frame;
    this.#options = options;

    // The eager all-registrations validation, gated to the FRAMELESS
    // construction (the one `build()` performs) so `createScope`'s child
    // constructions never re-validate the shared sealed maps.
    if (options?.validateOnBuild === true && frame === undefined) {
      this.#validateOnBuild();
    }
  }

  /**
   * The name of this provider's open scope frame. Throws if the provider is
   * frameless (no scope open — e.g. the provider straight from `build()`).
   */
  public get name(): S {
    if (this.#frame === undefined) {
      throw new TypeError('This IServiceProvider has no scope frame open.');
    }
    return this.#frame.name as S;
  }

  /**
   * The use-after-dispose guard every public entry point opens with.
   *
   * `dispose()` drains the frame's `owned` list and is idempotent, so an
   * instance constructed after teardown would be cached and owned by a frame
   * nothing will ever drain again: built, never disposed, silently leaked. The
   * guard makes that loud instead. `dispose`/`disposeAsync` themselves stay
   * unguarded — a second close is a no-op by contract.
   */
  #assertLive(operation: string): void {
    if (this.#disposed) {
      throw new ProviderDisposedError(operation);
    }
  }

  // ── IScopeFactory ─────────────────────────────────────────────────────────────

  /**
   * Creates a child `IServiceProvider` whose scope frame is a new `Scope` named
   * `name`, parented to this provider's frame (or a top-level frame if this
   * provider is unscoped).
   *
   * Default name `"scoped"` is accepted only when `"scoped"` ∈ S (the
   * conditional-rest-param type ensures this at the call site).
   */
  public createScope(...args: 'scoped' extends S ? [name?: S] : [name: S]): IServiceProvider<S> {
    this.#assertLive('createScope');
    return this.#childScope((args[0] ?? 'scoped') as string, this.#frame);
  }

  /**
   * Builds a child `IServiceProvider` whose frame is a new `Scope` named `name`
   * parented to `parentFrame`, sharing this tree's sealed maps and closed memo.
   * The shared body behind both the public `createScope` and the resolution
   * view's `createScope`.
   */
  #childScope(name: string, parentFrame: Scope | undefined): IServiceProvider<S> {
    return new ServiceProviderClass<S>(this.#registrations, this.#openRegistrations, this.#closedMemo,
      new Scope(name, parentFrame), this.#options);
  }

  // ── IResolver ─────────────────────────────────────────────────────────────────

  /**
   * Resolves synchronously. Runs the spine in sync mode — async never enters
   * (the `Promise<T>` fallback is gated off), so a miss is the honest
   * `UnregisteredTokenError`. A cached in-flight async construction throws
   * `AsyncResolutionRequiredError` (the guard here is defensive; sync mode
   * provably never RETURNS a Pending — a cached one throws inside the spine).
   * The public entry point starts a fresh cycle-detection stack.
   */
  public resolve<T>(token: Token, pattern: RegExp): T[];
  public resolve(token: Token, pattern: RegExp): unknown[];
  public resolve<T>(token: Token, key?: string): T;
  public resolve(token: Token, key?: string): unknown;
  public resolve<T>(token?: Token, key: string | RegExp = ''): T | T[] {
    this.#assertLive('resolve');
    if (token === undefined) {
      throw new TypeError(
        'resolve<T>() requires the @rhombus-std/di.extras plugin (no token at '
          + 'runtime). Without it, resolve with an explicit token: '
          + 'resolve<T>("my:token").',
      );
    }
    if (key instanceof RegExp) {
      return this.#resolveKeyed<T>(token, key, this.#frame, []);
    }
    const lookupToken = composeKeyed(token, key);
    const result = this.#resolve<T>(lookupToken, this.#frame, [], false);
    if (isPending(result)) {
      throw new AsyncResolutionRequiredError(lookupToken);
    }
    return result;
  }

  /**
   * Resolves asynchronously. Same spine, async mode: a lookup miss may be
   * satisfied by an honest `Promise<T>` registration. Always returns a Promise;
   * the Pending carrier never escapes. (`async` keyword: resolution errors
   * surface as rejections, the natural channel for a Promise-returning API.)
   */
  public resolveAsync<T>(token: Token): Promise<T>;
  public resolveAsync(token: Token): Promise<unknown>;
  public async resolveAsync<T>(token?: Token): Promise<T> {
    this.#assertLive('resolveAsync');
    if (token === undefined) {
      throw new TypeError(
        'resolveAsync<T>() requires the @rhombus-std/di.extras plugin (no token '
          + 'at runtime). Without it, resolve with an explicit token: '
          + 'resolveAsync<T>("my:token").',
      );
    }
    return settle(this.#resolve<T>(token, this.#frame, [], true)) as Promise<T>;
  }

  /**
   * Non-throwing resolve — the resolved instance, or `undefined` when `token` is
   * UNREGISTERED. Only an unregistered token softens to
   * `undefined`; a registered token whose construction fails for another reason
   * (missing dependency, cycle, async-only) throws exactly as `resolve` would —
   * the registration probe (`#lookup`) is what distinguishes "not a service"
   * from "a service that failed to build".
   */
  public tryResolve<T>(token: Token, pattern: RegExp): T[];
  public tryResolve(token: Token, pattern: RegExp): unknown[];
  public tryResolve<T>(token: Token, key?: string): T | undefined;
  public tryResolve(token: Token, key?: string): unknown;
  public tryResolve<T>(token?: Token, key: string | RegExp = ''): T | T[] | undefined {
    this.#assertLive('tryResolve');
    if (token === undefined) {
      throw new TypeError(
        'tryResolve<T>() requires the @rhombus-std/di.extras plugin (no token at '
          + 'runtime). Without it, resolve with an explicit token: '
          + 'tryResolve<T>("my:token").',
      );
    }
    if (key instanceof RegExp) {
      // Plural is intrinsically non-throwing on count — 0 matches is `[]`, so
      // tryResolve-plural is the same scan as resolve-plural.
      return this.#resolveKeyed<T>(token, key, this.#frame, []);
    }
    const lookupToken = composeKeyed(token, key);
    if (!this.#isKnown(lookupToken)) {
      return undefined;
    }
    const result = this.#resolve<T>(lookupToken, this.#frame, [], false);
    if (isPending(result)) {
      throw new AsyncResolutionRequiredError(lookupToken);
    }
    return result;
  }

  /**
   * Token-based registration predicate — `true` when `token` has a registration
   * (exact, or synthesizable from an open-generic template), `false` otherwise;
   * being token-based it also covers the keyed case. A pure probe: it does NOT
   * construct, so a registered token whose dependencies are missing still
   * reports `true`.
   */
  public isService(token: Token): boolean {
    this.#assertLive('isService');
    return this.#isKnown(token);
  }

  /**
   * True when `token` names something resolvable: a registration (exact or
   * open-generic-synthesizable), the intrinsic provider, or a collection wrapper
   * (`Array<T>` / `Iterable<T>`). A collection token always probes true — its
   * aggregate may be empty, and an empty collection is a valid resolution. The
   * shared probe behind `isService` and `tryResolve` (public and the view).
   */
  #isKnown(token: Token): boolean {
    return (isProviderToken(token) || this.#lookup(token) !== undefined || collectionRequest(token) !== undefined);
  }

  /**
   * Returns a FACTORY for `type` rather than an instance. When `params` is
   * absent or empty, returns a strict zero-arg `() => T` — every ctor slot must
   * resolve from the container (an unresolvable slot throws). When `params` is
   * present, it is the complete authored-order list of caller-supplied parameter
   * tokens; the returned factory has shape `(...params) => T`.
   *
   * The typed `<F>` overload is compile-time only — the runtime body returns the
   * built callable as `unknown`.
   */
  public resolveFactory<F>(type: Token, params?: readonly Token[]): F;
  public resolveFactory(type: Token, params?: readonly Token[]): unknown;
  public resolveFactory(type: Token, params?: readonly Token[]): unknown {
    this.#assertLive('resolveFactory');
    return this.#makeFactory({ type, params }, this.#frame);
  }

  // ── Registration lookup ─────────────────────────────────────────────────────

  /**
   * Every registration `token` can be served by, MOST-SPECIFIC FIRST — the
   * synthesized closings of every open template whose base bucket `token` falls
   * into and whose shape it unifies with. The result is memoized under the closed
   * token and the memo is shared across the whole provider tree, so one closing
   * is synthesized ONCE: singular resolution and a collection element that name
   * the same template get the identical `Registration` object, and the frame
   * cache (keyed by registration) therefore keys them together.
   *
   * The chain: memo hit → reject a holey token (letting one reach the open table
   * would "close" a template with its own holes) → parse as a closed generic →
   * ranked open-table candidates → match → substitute → synthesize. Never throws:
   * a malformed token, a non-generic one, and an empty bucket all miss cleanly.
   * A miss is NOT memoized — misses are unbounded (every `Promise<T>` probe is
   * one), so caching them would grow the map without limit.
   */
  #closings(token: Token): readonly Registration[] {
    const memoized = this.#closedMemo.get(token);
    if (memoized !== undefined) {
      return memoized;
    }

    // An open template is not resolvable. Classification runs through the SAME
    // `isOpenToken` the registration boundary uses, so a request and a
    // registration never disagree about what is a template — over the UNKEYED
    // token, so a keyed one is seen for what it is. Miss, never throw.
    if (isOpenToken(unkeyedToken(token))) {
      return NO_CLOSINGS;
    }

    // Parse the closed GROUND token into the typed model. A malformed or
    // non-generic token is not an open-template closing — miss cleanly.
    // `tryParse` never throws, so this never throws.
    const ground = TokenNode.tryParse(token);
    if (ground === undefined || ground.kind !== 'concrete' || !ground.args.length) {
      return NO_CLOSINGS;
    }

    // The open table is keyed by the template's base; `TokenNode.baseKey(ground)`
    // (base + key, generics stripped — package is folded into base) is the
    // matching key.
    const candidates = this.#openRegistrations.get(TokenNode.baseKey(ground));
    if (candidates === undefined) {
      return NO_CLOSINGS;
    }

    // MOST-SPECIFIC-FIRST, ties to the latest registration. A template may mix
    // concrete args and holes, so overlap on one base is normal —
    // `IRepo<IUser,$1>` and `IRepo<$1,$2>` both live under `IRepo` — and pure
    // recency would silently serve the general template to an author who
    // registered the specific one first. Identical templates score equally and
    // fall through to the latest index, preserving last-wins where specificity
    // does not decide.
    const synthesized: Registration[] = [];
    for (const { template, open } of rankTemplates(candidates)) {
      const bind = MATCHER.match(template, ground);
      if (!bind) {
        continue;
      }

      // Synthesize the closed registration: the open registration's ctor + scope
      // tag, with the closing's args substituted through the carried template
      // signatures BY LABEL. A signature-less open registration has no template
      // to substitute (a zero-arg ctor closes to a bare `new Ctor()`).
      //
      // Substitution can fail when a mis-authored template references a hole the
      // service token never binds (e.g. `IX<$1,$3>` carrying a dep on `$2`) —
      // `closeSignatures` throws `RangeError` then. This must NEVER throw (so
      // `#isResolvable` can probe safely and greedy selection can fall back), so
      // a template that cannot be closed simply is not a candidate FOR THIS
      // closing — the same `continue` a `match` miss takes. Aborting the whole
      // scan instead would let one mis-authored template delete the closings
      // already synthesized from its better-ranked siblings. With every
      // candidate skipped the list ends up empty, which is the miss the sole
      // mis-authored template case wants.
      let signatures: ReadonlyArray<readonly DepSlot[]> | undefined;
      if (open.signatures !== undefined) {
        try {
          signatures = closeSignatures(open.signatures, bind);
        } catch (err) {
          if (err instanceof RangeError) {
            continue;
          }
          throw err;
        }
      }

      // Synthesize the closed producer record. Wrap the template ctor exactly as
      // the builder does for an exact class, carrying `name`/`arity` off the ctor
      // (the wrapper itself reports `""`/`0`).
      const ctor = open.ctor;
      synthesized.push({ produce: (...a: unknown[]) => new ctor(...a), scope: open.scope, signatures, name: ctor.name,
        arity: ctor.length });
    }

    if (!synthesized.length) {
      return NO_CLOSINGS;
    }
    const closings = Object.freeze(synthesized);
    this.#closedMemo.set(token, closings);
    return closings;
  }

  /**
   * Returns the ONE registration singular resolution of `token` uses: the
   * most-recent exact registration, else the most-specific open-template closing.
   * The sealed map is shared across all providers in the tree.
   *
   * The single lookup funnel — instance resolution, factory injection, and
   * satisfiability all come through here. Exact beats open (this order IS the
   * precedence rule). Never throws: a holey token simply misses (so
   * `#isResolvable` is false for it); the dedicated error is raised by
   * `#resolve`.
   */
  #lookup(token: Token): Registration | undefined {
    const list = this.#registrations.get(token);
    if (list !== undefined && list.length) {
      return list[list.length - 1];
    }
    return this.#closings(token)[0];
  }

  /**
   * Finds the nearest ancestor scope frame (inclusive) whose name matches
   * `scopeName`, walking UP the chain. Returns `undefined` when none matches.
   */
  static #findOwner(vantage: Scope | undefined, scopeName: string): Scope | undefined {
    let node = vantage;
    while (node !== undefined) {
      if (node.name === scopeName) {
        return node;
      }
      node = node.parent;
    }
    return undefined;
  }

  // ── Resolution ──────────────────────────────────────────────────────────────

  /**
   * The spine. Owns the WHERE of resolution: cycle detection, lookup, the
   * async fallback (the ONLY place async enters), scope ownership, caching,
   * and single-flight. Construction mechanics live in `#instantiate`; slot
   * dispatch lives in `#resolveSlot`, whose token arm is the spine's only
   * re-entry point. Returns `T | Pending<T>` — the union is private and is
   * collapsed by the two public methods.
   *
   * `vantage` is the scope frame the walk starts from. `stack` is the active
   * resolution path (for cycle detection); it is shared across the whole
   * `resolve()`/`resolveAsync()` call but never across separate calls. `async`
   * gates whether the `Promise<T>` fallback can satisfy a lookup miss.
   * `captor` is the nearest enclosing OWNED construction — `undefined` at the
   * public entry points, set by `#resolveWith` when it constructs an instance
   * a frame will cache — consumed only by the `validateScopes` check.
   */
  #resolve<T>(token: Token, vantage: Scope | undefined, stack: Token[], async: boolean, captor?: Captor): T | Pending<
    T
  > {
    if (stack.includes(token)) {
      throw new CircularDependencyError([...stack, token]);
    }

    // The provider is an intrinsic resolvable: a `IResolver`-typed dependency
    // (the token `RESOLVER_TOKEN`) resolves to the live provider VIEW relative to
    // the resolving frame, never a registration.
    if (isProviderToken(token)) {
      return this.#makeProviderView(vantage, stack, captor) as T;
    }

    const registration = this.#lookup(token);
    if (!registration) {
      // ── The async fallback — the only mint-site of a Pending from a raw
      // promise. A missing T satisfied by its honest Promise<T> registration:
      // resolve THAT (an ordinary direct hit — its cache entry is what makes
      // overlapping resolveAsync calls share one construction) and carry it.
      // Typing the inner resolve as T matches runtime truth: settle hands back
      // a promise that fulfills with T (promise auto-flattening).
      if (async) {
        const promiseToken = closeToken('Promise', token);
        if (this.#lookup(promiseToken)) {
          return new Pending(settle(this.#resolve<T>(promiseToken, vantage, stack, async, captor)));
        }
      }
      // ── Collection resolution. A missed `Array<T>` / `Iterable<T>` token is
      // NOT an error: aggregate every registration of T (empty when T is
      // unregistered — bare-T still throws). An as-requested wrapper binding was
      // already handled above (an exact / open-generic `#lookup` hit short-
      // circuits the aggregation, step 1 of the two-step lookup).
      const collection = collectionRequest(token);
      if (collection) {
        return this.#resolveCollection(collection, vantage, stack, async, captor) as T | Pending<T>;
      }
      // A holey token can never resolve — it is a template naming a FAMILY of
      // tokens. Distinguish that from a plain miss so the fix is actionable, for
      // every spelling of the template and not just the canonical one.
      // Over the UNKEYED token: `resolve("pkg:IRepo<$1>", "redis")` composes
      // `pkg:IRepo<$1>#redis`, and the unbound hole — not the key — is the
      // actionable half of that diagnosis.
      if (isOpenToken(unkeyedToken(token))) {
        throw new OpenTokenResolutionError(token);
      }
      throw new UnregisteredTokenError(token);
    }

    return this.#resolveWith<T>(token, registration, vantage, stack, async, captor);
  }

  /**
   * Resolves a KNOWN registration for `token`: finds its owner frame, honors the
   * cache (single-flight included), and constructs on a miss. The cache is keyed
   * by the REGISTRATION object, not the token — so the N accumulated
   * registrations of one token cache independently: a collection resolution
   * builds each element through here, while bare-T resolution and the
   * aggregate's last element share the last registration's slot.
   *
   * A value folds into this path: its producer is `() => value` with no scope,
   * so it takes the transient branch (no owner, no cache) and `#instantiate`
   * returns `produce()` verbatim — a value that IS a Promise is returned raw,
   * never awaited.
   *
   * THE CENTRAL PRINCIPLE: a scope tag with no matching OPEN frame yields no
   * owner, and no owner means transient — fresh instance, no cache, no error.
   * Untagged registrations take the same path. The construct-relative-to-owner
   * rule still holds: a longer-lived service resolving a shorter-lived dep whose
   * frame is not an ancestor gets a fresh transient, never a captured cached
   * instance.
   */
  #resolveWith<T>(token: Token, registration: Registration, vantage: Scope | undefined, stack: Token[], async: boolean,
    captor?: Captor): T | Pending<T>
  {
    if (stack.includes(token)) {
      throw new CircularDependencyError([...stack, token]);
    }

    const owner = registration.scope ? ServiceProviderClass.#findOwner(vantage, registration.scope) : undefined;

    // ── The owning frame must still be OPEN. `#assertLive` guards THIS provider,
    // but disposal does not cascade, so a live child scope can still reach a
    // parent frame whose provider was closed — and an instance cached there is
    // the exact leak the dispose guard exists to prevent (a second, idempotent
    // `dispose()` never re-drains it). Refuse loudly instead. A transient
    // registration has no owner and so cannot leak; it is unaffected.
    if (owner?.disposed) {
      throw new ProviderDisposedError(`resolve "${token}" into the closed "${owner.name}" scope`);
    }

    // ── Scope validation (`validateScopes`). A scope tag with no matching open
    // frame would fall back to a transient — the central-principle fallback —
    // and that is the hazard: a "scoped" service resolved from a frameless
    // provider, or consumed by a longer-lived one (an instance owned by a frame
    // whose chain lacks the tag's frame). Both collapse to this one check;
    // `captor` and `stack[0]` say which of the two to report.
    if (this.#options?.validateScopes === true && registration.scope && owner === undefined) {
      throw new ScopeValidationError(token, registration.scope, captor, stack[0]);
    }

    if (owner?.cache.has(registration)) {
      const hit = owner.cache.get(registration) as T | Pending<T>;
      if (isPending(hit) && !async) {
        // A concurrent async construction is in flight; sync cannot wait.
        throw new AsyncResolutionRequiredError(token);
      }
      return hit;
    }

    stack.push(token);
    try {
      // Construct relative to the OWNER when one exists — the critical rule —
      // otherwise relative to the current vantage (the transient path). An
      // OWNED construction becomes the captor its dependency resolutions see
      // (nearest-owned wins); a transient construction passes the enclosing one
      // through.
      const instance = this.#instantiate<T>(token, registration, owner ?? vantage, stack, async,
        owner !== undefined ? { token, scope: registration.scope! } : captor);
      if (owner) {
        // Single-flight: the entry (a Pending included) lands in the cache
        // synchronously, before anything settles — overlapping resolveAsync
        // calls share one construction. `owned` keeps the Pending itself so
        // disposal sees what was actually produced.
        owner.cache.set(registration, instance);
        owner.owned.push(instance);
        if (isPending(instance)) {
          // Self-upgrade on settle. The rejection no-op keeps this bookkeeping
          // channel from raising an unhandled rejection — consumers hold the
          // same promise and see the failure on their own channel. A rejected
          // Pending stays cached: single-flight shares outcomes, failures too.
          instance.promise.then((value) => {
            owner.cache.set(registration, value);
          }, () => {});
        }
      }
      return instance;
    } finally {
      stack.pop();
    }
  }

  /**
   * Resolves a collection request: aggregates every registration of the element
   * token in REGISTRATION ORDER and wraps them as requested. Each element is
   * built through `#resolveWith`, so it honors its OWN registration's
   * lifetime/caching; the aggregate's last element is therefore the same
   * instance bare-T resolution yields (last-wins). An unregistered element
   * aggregates to an EMPTY collection. When any element is async (a Pending),
   * the whole collection settles as one Pending.
   */
  #resolveCollection(request: CollectionRequest, vantage: Scope | undefined, stack: Token[], async: boolean,
    captor?: Captor): unknown | Pending<unknown>
  {
    const registrations = this.#collectionRegistrations(request.element);
    const elements = registrations.map((registration) =>
      this.#resolveWith<unknown>(request.element, registration, vantage, stack, async, captor)
    );

    if (!elements.some(isPending)) {
      return wrapCollection(request.base, elements);
    }

    return new Pending((async () => {
      const settled: unknown[] = [];
      for (const element of elements) {
        settled.push(isPending(element) ? await element.promise : element);
      }
      return wrapCollection(request.base, settled);
    })());
  }

  /**
   * The registrations to aggregate for a collection's element token: EVERY
   * open-template closing the element unifies with, then the exact per-token
   * list. Both contribute — an open template is a registration of its closings,
   * so `Array<IHandler<Cmd>>` enumerates the closings of every `IHandler<$1>`
   * template alongside any exact `IHandler<Cmd>`. Neither present ⇒ an
   * unregistered element aggregates to EMPTY.
   *
   * ORDER. The aggregate's LAST element must be the instance bare-`T` resolution
   * yields, since that is what last-wins means to a caller holding both. So the
   * exact list (whose last entry `#lookup` returns) comes last, and the closings
   * — ranked most-specific-first — are REVERSED, putting the most specific one
   * `#lookup` would pick nearest the end. Within each group registration order
   * is preserved.
   */
  #collectionRegistrations(element: Token): readonly Registration[] {
    const exact = this.#registrations.get(element) ?? [];
    const closings = this.#closings(element);
    if (!closings.length) {
      return exact;
    }
    return [...closings].reverse().concat(exact);
  }

  /**
   * Resolves the PLURAL keyed form: scans `base`'s key-space and returns every
   * registration whose KEY PORTION matches `pattern`, in registration order,
   * each honoring its own registration's lifetime (resolved through
   * `#resolveWith`, exactly as a collection element is).
   *
   * The scan is confined to the FIXED `base`: a token counts only when it is
   * exactly `base` (key portion `""`, the bare non-keyed registration) or
   * `base + "#" + <k>` (key portion `<k>`). The regex tests the KEY PORTION
   * alone — NEVER the whole token — so a keyed scan can never wander into a
   * collection wrapper (`Array<base>`) or a different type. A dot-plus pattern
   * matches any non-empty key; a dot-star pattern matches everything including
   * the bare token; a specific pattern matches those keys. 0 matches is `[]`,
   * never a throw.
   *
   * BOTH tables feed the scan. Keyed registrations are ordinary exact
   * registrations, but an open template may be keyed too, so a matching key
   * whose only registration is a template closing must appear here exactly as it
   * appears under the singular `resolve(base, key)` — otherwise the two views of
   * one registration disagree. Each matching key resolves through
   * `#collectionRegistrations`, which is the same closings-then-exact rule
   * `Array<T>` aggregates by; for a key with no template it returns the exact
   * list untouched.
   */
  #resolveKeyed<T>(base: Token, pattern: RegExp, vantage: Scope | undefined, stack: Token[]): T[] {
    const prefix = base + KEY_SEPARATOR;
    const matches: T[] = [];
    // The pattern belongs to the CALLER. A `/…/g` regex advances `lastIndex` on
    // every `test`, so the scan zeroes it before each key to stay stateless
    // across the keys — and restores what the caller handed in on the way out,
    // so a resolve never mutates an argument it was lent.
    const callerLastIndex = pattern.lastIndex;
    try {
      for (const token of this.#keySpace(base, prefix)) {
        pattern.lastIndex = 0;
        if (!pattern.test(token === base ? '' : token.slice(prefix.length))) {
          continue;
        }
        for (const registration of this.#collectionRegistrations(token)) {
          const result = this.#resolveWith<T>(token, registration, vantage, stack, false);
          if (isPending(result)) {
            throw new AsyncResolutionRequiredError(token);
          }
          matches.push(result);
        }
      }
    } finally {
      pattern.lastIndex = callerLastIndex;
    }
    return matches;
  }

  /**
   * The tokens making up `base`'s key-space — `base` itself and every
   * `base + "#" + <k>` anything is registered under — in registration order,
   * exact registrations first.
   *
   * The exact map is keyed by the token itself, so its arm is a prefix test. The
   * open table is keyed by the TEMPLATE's `baseKey` (`pkg:IRepo#redis`), which
   * shares the ground token's base but not its generic args, so its arm maps each
   * matching bucket back to the closed token that bucket would serve — the key is
   * carried across, the generics come from `base`.
   */
  *#keySpace(base: Token, prefix: string): Generator<Token> {
    const yielded = new Set<Token>();
    for (const token of this.#registrations.keys()) {
      if (token === base || token.startsWith(prefix)) {
        yielded.add(token);
        yield token;
      }
    }
    const ground = TokenNode.tryParse(base);
    if (ground === undefined) {
      return;
    }
    const groundBase = TokenNode.baseKey(ground);
    const openPrefix = groundBase + KEY_SEPARATOR;
    for (const bucket of this.#openRegistrations.keys()) {
      let token: Token;
      if (bucket === groundBase) {
        token = base;
      } else if (bucket.startsWith(openPrefix)) {
        token = prefix + bucket.slice(openPrefix.length);
      } else {
        continue;
      }
      if (!yielded.has(token)) {
        yielded.add(token);
        yield token;
      }
    }
  }

  /**
   * Owns the HOW of construction: the missing-metadata check, greedy
   * (async-aware) signature selection, slot fill, and the fast/slow build. Every
   * kind builds through one call — `registration.produce(...args)` — so there is
   * no `class`/`value`/`factory` branch here. Never touches the cache or the
   * stack — that is the spine's job. `owningFrame` is the scope frame whose chain
   * the dependencies are resolved against — THE critical rule.
   */
  #instantiate<T>(token: Token, registration: Registration, owningFrame: Scope | undefined, stack: Token[],
    async: boolean, captor?: Captor): T | Pending<T>
  {
    const signatures = registration.signatures;

    if (!signatures?.length) {
      // A signature-less producer takes no injected args. `arity` (the ctor's
      // original `.length`, carried explicitly — the wrapper reports 0) is what
      // distinguishes a class ctor that NEEDS args (missing metadata) from a
      // value / zero-arg ctor / provider-less factory that legitimately runs
      // with none.
      if (registration.arity) {
        throw new MissingMetadataError(token, registration.name);
      }
      return registration.produce() as T;
    }

    const signature = this.#selectSignature(token, registration.name, signatures, async);
    const args = signature.map((slot) => this.#resolveSlot<unknown>(slot, owningFrame, stack, async, captor));

    const build: Func<[readonly unknown[]], T> = (builtArgs) => registration.produce(...builtArgs) as T;

    // FAST path: no pending arg — build synchronously.
    if (!args.some(isPending)) {
      return build(args);
    }

    // SLOW path: settle args SEQUENTIALLY (constructor/owned ordering is part
    // of the contract — never Promise.all), then build. Only a Pending is
    // awaited; a raw Promise arg is an honest value and passes through intact.
    return new Pending((async () => {
      const settled: unknown[] = [];
      for (const arg of args) {
        settled.push(isPending(arg) ? await arg.promise : arg);
      }
      return build(settled);
    })());
  }

  /**
   * The provider VIEW handed back when the intrinsic provider token resolves (a
   * `IResolver` / `IScopeFactory` typed parameter). A IServiceProvider-like view
   * that continues the active cycle `stack` and resolves relative to
   * `owningFrame`.
   *
   * A view is typically held by a long-lived instance and called long after the
   * resolve that minted it, so each of its members opens with the same
   * use-after-dispose guard the public entry points do — it reads the very same
   * `#disposed` flag, since the view is a face on THIS provider.
   */
  #makeProviderView(owningFrame: Scope | undefined, stack: Token[], captor?: Captor): IResolver & IScopeFactory<S> {
    const sp = this;
    return { resolve: <U>(depToken?: Token, key: string | RegExp = ''): U | U[] => {
      sp.#assertLive('resolve');
      if (depToken === undefined) {
        throw new TypeError('resolve<T>() requires the @rhombus-std/di.extras plugin (no token at ' + 'runtime).');
      }
      if (key instanceof RegExp) {
        return sp.#resolveKeyed<U>(depToken, key, owningFrame, stack);
      }
      // Sync mode never yields a Pending — the spine throws on a cached one.
      return sp.#resolve<U>(composeKeyed(depToken, key), owningFrame, stack, false, captor) as U;
    }, resolveAsync: async <U>(depToken?: Token): Promise<U> => {
      sp.#assertLive('resolveAsync');
      if (depToken === undefined) {
        throw new TypeError('resolveAsync<T>() requires the @rhombus-std/di.extras plugin (no ' + 'token at runtime).');
      }
      return settle(sp.#resolve<U>(depToken, owningFrame, stack, true, captor)) as Promise<U>;
    }, tryResolve: <U>(depToken?: Token, key: string | RegExp = ''): U | U[] | undefined => {
      sp.#assertLive('tryResolve');
      if (depToken === undefined) {
        throw new TypeError('tryResolve<T>() requires the @rhombus-std/di.extras plugin (no token ' + 'at runtime).');
      }
      if (key instanceof RegExp) {
        return sp.#resolveKeyed<U>(depToken, key, owningFrame, stack);
      }
      const lookupToken = composeKeyed(depToken, key);
      if (!sp.#isKnown(lookupToken)) {
        return undefined;
      }
      // Sync mode never yields a Pending — the spine throws on a cached one.
      return sp.#resolve<U>(lookupToken, owningFrame, stack, false, captor) as U;
    }, isService: (depToken: Token): boolean => {
      sp.#assertLive('isService');
      return sp.#isKnown(depToken);
    }, resolveFactory: (depToken: Token, depParams?: readonly Token[]): unknown => {
      sp.#assertLive('resolveFactory');
      return sp.#makeFactory({ type: depToken, params: depParams }, owningFrame);
    }, createScope: (...args: ['scoped'?] | [S]): IServiceProvider<S> => {
      sp.#assertLive('createScope');
      return sp.#childScope((args[0] ?? 'scoped') as string, owningFrame);
    } } as IResolver & IScopeFactory<S>;
  }

  /**
   * Builds the callable injected for a `FactoryRef` parameter.
   *
   * When `ref.params` is absent or empty, the factory is STRICT: every ctor slot
   * of the target must resolve from the container. An unresolvable slot throws at
   * build time (via `selectSignature`). The result is a zero-arg `() => T` that
   * respects the target's registered lifetime.
   *
   * When `ref.params` is present, it is the COMPLETE authored-order list of
   * caller-supplied parameter tokens. The caller-supplied set is pinned to those
   * tokens (by first-occurrence left-to-right matching against ctor slots). A
   * slot token that appears in `params` is caller-supplied even if it is also
   * registered (caller wins). A slot that is neither claimed by `params` nor
   * resolvable from the container → error. The factory shape is exactly
   * `(...params) => T`; a fresh instance is built on every call (bypassing the
   * instance cache — caller args differ per call so caching would be wrong).
   *
   * Lifetime semantics:
   *   - A ZERO-ARG (no-params) factory routes through the normal `resolve` path
   *     and RESPECTS the target's registered lifetime.
   *   - A PARAMETERIZED factory constructs a FRESH instance every call.
   *
   * The closure captures `owningFrame`, so at call time the target's deps
   * resolve relative to the scope that owns the factory-holding instance.
   *
   * Both returned callables open with the same use-after-dispose guard the
   * public entry points and the provider view do. A factory is minted during one
   * resolve and INVOKED arbitrarily later — typically off a slot injected into a
   * long-lived instance — so the guard on the minting call says nothing about the
   * call that builds; without it a closed scope keeps constructing into a frame
   * nothing will drain again.
   */
  #makeFactory(ref: FactoryRef, owningFrame: Scope | undefined): Func<unknown[], unknown> {
    const sp = this;
    const target = this.#lookup(ref.type);

    if (target === undefined) {
      throw new FactoryTargetError(ref.type, 'unregistered');
    }

    const callerParams = ref.params !== undefined && ref.params.length ? ref.params : undefined;

    // No caller params → the strict zero-arg thunk: route through the normal
    // resolve path so the registered lifetime is respected. A value target folds
    // in (its producer is `() => value`, so resolving returns the stored
    // instance every call), so no target-shape branch is needed.
    if (callerParams === undefined) {
      return () => {
        sp.#assertLive(`invoke the factory for "${ref.type}"`);
        return sp.#resolve<unknown>(ref.type, owningFrame, [], false);
      };
    }

    // Parameterized mode: the target's signatures ride on its registration
    // record (a synthesized closed-generic target carries its substituted
    // signatures). Select the target signature and partition slots against the
    // caller-supplied params list.
    const signatures = target.signatures;
    const targetSignature = signatures === undefined || !signatures.length
      ? undefined
      : sp.#selectTargetSignature(signatures);

    // Build a fresh instance on every call, threading caller args into the
    // params-claimed slots and resolving the remainder from the container.
    // A fresh cycle stack per call — the factory runs outside the resolve that
    // created it.
    return (...callArgs: unknown[]) => {
      sp.#assertLive(`invoke the factory for "${ref.type}"`);
      return sp.#buildPartitioned(ref.type, target, targetSignature as readonly DepSlot[] | undefined, callerParams,
        callArgs, owningFrame);
    };
  }

  /**
   * Builds a factory target with the params-driven caller-supplied partition.
   *
   * `callerParams` is the authored-order list of tokens whose values are
   * supplied by the caller (from the `FactoryRef.params` list). Each ctor slot
   * whose token appears in `callerParams` (first-occurrence left-to-right match)
   * takes the corresponding `callArgs` value; every other slot resolves from the
   * container. A slot that is neither claimed nor resolvable → error (the factory
   * cannot be built). A claimed slot that is also registered → caller wins.
   *
   * Always builds a fresh result — a parameterized factory bypasses the instance
   * cache. Runs on a fresh cycle stack since the factory is invoked outside the
   * original resolve.
   *
   * `signature` may be `undefined` when the target has no signatures (zero-arg
   * ctor or record-less factory) — in that case args is empty.
   */
  #buildPartitioned<T>(targetToken: Token, target: Registration, signature: readonly DepSlot[] | undefined,
    callerParams: readonly Token[], callArgs: readonly unknown[], owningFrame: Scope | undefined): T
  {
    const stack: Token[] = [];

    if (signature === undefined || !signature.length) {
      return target.produce() as T;
    }

    // Each `callerParams` entry is consumed at most once: the pool holds the
    // still-unmatched param positions, and a slot claims the FIRST one whose
    // token it equals — so the signature is walked left-to-right against the
    // params list in authored order.
    const remainingParamIndices: number[] = callerParams.map((_, i) => i);

    const args = signature.map((slot) => {
      if (typeof slot === 'string') {
        // A claimed slot takes the caller's value even when the token is also
        // registered.
        const matchIdx = remainingParamIndices.findIndex((pi) => callerParams[pi] === slot);
        if (matchIdx !== -1) {
          const paramIdx = remainingParamIndices[matchIdx]!;
          remainingParamIndices.splice(matchIdx, 1);
          return callArgs[paramIdx];
        }

        if (!this.#isResolvable(slot, false)) {
          throw new NoSatisfiableSignatureError(targetToken, target.name, [slot]);
        }
        return this.#resolve<unknown>(slot, owningFrame, stack, false);
      }
      return this.#resolveSlot<unknown>(slot, owningFrame, stack, false);
    });

    return target.produce(...args) as T;
  }

  /**
   * Greedy signature selection. Scans signatures longest → shortest and returns
   * the first SATISFIABLE one. A slot is satisfiable when it is:
   *
   *   - a `FactoryRef` — satisfiable iff its TARGET token resolves (injection
   *     itself raises `FactoryTargetError` on a miss);
   *   - a `LiteralRef` — always satisfiable; injected as its value (Rule 2);
   *   - a `Union` — satisfiable iff at least one member is resolvable; or
   *   - a string token whose registration exists in the sealed map, the
   *     intrinsic provider token (always satisfiable — the live view), or a
   *     collection wrapper (always satisfiable — the aggregate may be empty).
   *
   * An unregistered string token is not satisfiable — unless it is the provider
   * token, or `async` and its honest `Promise<T>` registration exists (the
   * fallback the spine will take). Equal-arity ties break by registration order.
   * None satisfiable ⇒ throw naming the unsatisfiable tokens.
   */
  #selectSignature(token: Token, targetName: string, signatures: ReadonlyArray<readonly DepSlot[]>,
    async: boolean): readonly DepSlot[]
  {
    const unsatisfiable = new Set<Token>();
    // Factory-target misses are tracked apart from the plain unsatisfiable
    // tokens so the more actionable `FactoryTargetError` still surfaces when an
    // unregistered target is the ONLY thing standing in the way.
    const factoryMisses = new Set<Token>();
    for (const sig of orderByArityDesc(signatures)) {
      let satisfiable = true;
      for (const slot of sig) {
        if (isLiteralRef(slot)) {
          continue;
        }
        if (isFactoryRef(slot)) {
          // A factory slot is satisfiable iff its TARGET is registered —
          // `#makeFactory` raises `FactoryTargetError` on a miss, and a signature
          // that is going to throw is not one greedy selection should pick over a
          // shorter one that builds.
          if (this.#lookup(slot.type) === undefined) {
            satisfiable = false;
            factoryMisses.add(slot.type);
          }
          continue;
        }
        if (isTypeArgRef(slot)) {
          // A raw TypeArgRef is an unclosed template slot — never satisfiable
          // (only substitution turns it into a LiteralRef).
          satisfiable = false;
          continue;
        }
        if (isUnionSlot(slot)) {
          // A union slot is satisfiable iff at least one member is resolvable.
          // When none is, surface its string-token members so the error names
          // exactly what to register.
          if (!this.#isResolvableSlot(slot, async)) {
            satisfiable = false;
            for (const token of unionTokenMembers(slot)) {
              unsatisfiable.add(token);
            }
          }
          continue;
        }
        if (!this.#isResolvable(slot, async)) {
          satisfiable = false;
          if (typeof slot === 'string') {
            unsatisfiable.add(slot);
          }
        }
      }
      if (satisfiable) {
        return sig;
      }
    }

    // Nothing built. When every obstacle was an unregistered factory TARGET,
    // raise the error `#makeFactory` used to — it names the one token to
    // register, against the signature-level "some dependency is missing". A run
    // that also hit a plain unregistered token is not a factory problem, so it
    // keeps the general error.
    if (factoryMisses.size && !unsatisfiable.size) {
      throw new FactoryTargetError([...factoryMisses][0]!, 'unregistered');
    }
    throw new NoSatisfiableSignatureError(token, targetName, [...unsatisfiable]);
  }

  /**
   * Greedy signature selection for a FACTORY TARGET. Unlike `selectSignature`,
   * there is no resolvability gate: a target's unregistered tokens are not
   * unsatisfiable — they are the factory's caller-supplied parameters. So the
   * choice is purely the longest signature, equal-arity ties broken by
   * registration order.
   */
  #selectTargetSignature(signatures: ReadonlyArray<readonly DepSlot[]>): readonly DepSlot[] {
    return orderByArityDesc(signatures)[0]!;
  }

  /**
   * True when `slot` is a registered string token — the intrinsic provider token
   * (always resolvable), or a registration in the sealed map, or a collection
   * wrapper (`Array<T>` / `Iterable<T>` — always resolvable: the aggregate may
   * be empty, and an empty collection is a valid resolution, exactly as
   * `#isKnown` probes it), or in `async` mode the honest `Promise<T>` fallback
   * the spine would take. A `FactoryRef` or `Union` is not tested here — use
   * `isResolvableSlot` for a full slot check.
   */
  #isResolvable(slot: DepSlot, async: boolean): boolean {
    if (typeof slot !== 'string') {
      return false;
    }
    if (isProviderToken(slot)) {
      return true;
    }
    if (this.#lookup(slot)) {
      return true;
    }
    if (collectionRequest(slot) !== undefined) {
      return true;
    }
    return async && !!this.#lookup(closeToken('Promise', slot));
  }

  /**
   * True when a slot is resolvable in ANY form:
   *   - `LiteralRef` — always satisfiable (its value is injected verbatim);
   *   - `FactoryRef` — satisfiable iff its TARGET token resolves, since
   *     `#makeFactory` raises `FactoryTargetError` otherwise;
   *   - `Union` — satisfiable iff at least one member is resolvable (recursive);
   *   - string token — the intrinsic provider token, a registration in the
   *     sealed map, or (async) the `Promise<T>` fallback.
   */
  #isResolvableSlot(slot: DepSlot, async: boolean): boolean {
    if (isLiteralRef(slot)) {
      return true;
    }
    if (isFactoryRef(slot)) {
      return this.#lookup(slot.type) !== undefined;
    }
    if (isTypeArgRef(slot)) {
      return false;
    }
    if (isUnionSlot(slot)) {
      return slot.union.some((member) => this.#isResolvableSlot(member, async));
    }
    return this.#isResolvable(slot, async);
  }

  /**
   * First-resolvable union. ONE loop serves both modes. In sync mode a member
   * either returns or throws (a Pending is impossible — the sync spine throws
   * on a cached one), so the loop degenerates to a plain skip/try/catch.
   * In async mode a pending member wins only by SETTLING: on rejection the
   * carried promise re-enters this same method on the REMAINING members —
   * per-member sequential await+catch, expressed as recursion instead of a
   * second loop. The deferred re-entry runs against a snapshot of the path (the
   * live stack has unwound by the time a rejection lands).
   */
  #resolveUnion<T>(slot: Union, owningFrame: Scope | undefined, stack: Token[], async: boolean, captor?: Captor,
    members: readonly DepSlot[] = slot.union as readonly DepSlot[]): T | Pending<T>
  {
    for (let i = 0; i < members.length; i++) {
      const member = members[i]!;
      if (!this.#isResolvableSlot(member, async)) {
        continue;
      }
      try {
        const result = this.#resolveSlot<T>(member, owningFrame, stack, async, captor);
        if (!isPending(result)) {
          return result;
        }
        const rest = members.slice(i + 1);
        const snapshot = [...stack];
        return new Pending(
          result.promise.catch(() => settle(this.#resolveUnion<T>(slot, owningFrame, snapshot, true, captor, rest))),
        );
      } catch {
        // Member resolvable in principle but failed to build (cycle, missing
        // nested dep, …) — fall through to the next candidate.
        continue;
      }
    }
    throw new NoSatisfiableUnionError(slot.union);
  }

  /**
   * THE slot dispatch — the single copy of the object-slot branch, shared by the
   * spine's arg fill, union member resolution, and `#buildPartitioned`. The
   * token arm is the only canonical recursion re-entry into `#resolve` — the
   * intrinsic provider token flows through it and is intercepted there (yielding
   * the live view), so there is no dedicated scope arm.
   *
   * An if-chain over the guard predicates (not a classifier + switch): each
   * guard narrows the slot for its own arm at zero cast cost, and exhausting
   * every object-slot guard leaves a bare string `Token` for the final arm.
   */
  #resolveSlot<T>(slot: DepSlot, owningFrame: Scope | undefined, stack: Token[], async: boolean, captor?: Captor): T
    | Pending<T>
  {
    if (isFactoryRef(slot)) {
      // The captor deliberately does NOT flow into the factory: it is invoked
      // later, outside this construction, so nothing here can capture it.
      return this.#makeFactory(slot, owningFrame) as T;
    }
    if (isUnionSlot(slot)) {
      return this.#resolveUnion<T>(slot, owningFrame, stack, async, captor);
    }
    if (isLiteralRef(slot)) {
      return slot.value as T;
    }
    if (isTypeArgRef(slot)) {
      throw rawTypeArgError(slot);
    }
    return this.#resolve<T>(slot, owningFrame, stack, async, captor);
  }

  // ── Build-time validation (`validateOnBuild`) ──────────────────────────────

  /**
   * The eager all-registrations validation `build({ validateOnBuild: true })`
   * runs. Every EXACT registration is dry-run validated — no instance is ever
   * constructed — and every failure is collected, wrapped per-registration in
   * a `RegistrationValidationError`, and thrown as ONE `AggregateError`, so a
   * broken graph reports all its holes at once.
   *
   * Open-template registrations are deliberately NOT validated: they have no
   * closed args to substitute into their dep signatures. A closing synthesized
   * from one IS validated when it appears as a dependency of an exact
   * registration.
   */
  #validateOnBuild(): void {
    const failures: RegistrationValidationError[] = [];
    const validated = new Set<Registration>();
    for (const [token, list] of this.#registrations) {
      for (const registration of list) {
        try {
          this.#validateRegistration(token, registration, [], validated);
        } catch (err) {
          failures.push(new RegistrationValidationError(token, err));
        }
      }
    }
    if (failures.length) {
      throw new AggregateError(failures, 'Some services are not able to be constructed');
    }
  }

  /**
   * Dry-run validation of one registration: the same checks construction would
   * hit — missing metadata, greedy signature selection (in async mode, the most
   * permissive: a service resolvable only via `resolveAsync` is still
   * constructible), then a RECURSIVE walk of the selected signature's slots —
   * without producing anything. `chain` is the active validation path (the
   * cycle detector, mirroring resolution's `stack`); `validated` memoizes
   * fully-validated registrations so shared dependencies are walked once.
   */
  #validateRegistration(token: Token, registration: Registration, chain: Token[], validated: Set<Registration>): void {
    if (validated.has(registration)) {
      return;
    }
    if (chain.includes(token)) {
      throw new CircularDependencyError([...chain, token]);
    }
    chain.push(token);
    try {
      const signatures = registration.signatures;
      if (!signatures?.length) {
        // Same rule as `#instantiate`: a signature-less producer is fine only
        // when its ctor genuinely takes no args.
        if (registration.arity) {
          throw new MissingMetadataError(token, registration.name);
        }
      } else {
        const signature = this.#selectSignature(token, registration.name, signatures, true);
        for (const slot of signature) {
          this.#validateSlot(slot, chain, validated);
        }
      }
      validated.add(registration);
    } finally {
      chain.pop();
    }
  }

  /**
   * Validates one dependency slot of a selected signature — the dry-run mirror
   * of `#resolveSlot`'s dispatch:
   *
   *   - `LiteralRef` — always constructible;
   *   - `TypeArgRef` — a raw template slot reaching resolution is always an
   *     error (only substitution closes it);
   *   - `FactoryRef` — injection requires the target registered (a miss throws
   *     `FactoryTargetError` at construction time); the factory BODY runs
   *     post-build with caller args, so its own graph is not walked;
   *   - `Union` — resolution takes the first member that BUILDS, falling
   *     through on failure, so the union validates iff some member does;
   *   - a string token — recurse (`#validateToken`).
   */
  #validateSlot(slot: DepSlot, chain: Token[], validated: Set<Registration>): void {
    if (isLiteralRef(slot)) {
      return;
    }
    if (isTypeArgRef(slot)) {
      throw rawTypeArgError(slot);
    }
    if (isFactoryRef(slot)) {
      if (this.#lookup(slot.type) === undefined) {
        throw new FactoryTargetError(slot.type, 'unregistered');
      }
      return;
    }
    if (isUnionSlot(slot)) {
      for (const member of slot.union) {
        try {
          this.#validateSlot(member, chain, validated);
          return;
        } catch {
          // Member invalid — fall through to the next candidate, exactly as
          // resolution would.
        }
      }
      throw new NoSatisfiableUnionError(slot.union);
    }
    this.#validateToken(slot, chain, validated);
  }

  /**
   * Validates a string-token dependency: the intrinsic provider is always
   * available; a collection wrapper validates every aggregated element
   * registration (an empty aggregate is a valid resolution); otherwise the
   * token's own registration (exact, or synthesized from an open template) is
   * validated recursively, with the honest `Promise<T>` fallback accepted —
   * matching `#selectSignature`'s async-mode satisfiability. The trailing
   * throw is defensive: a slot only reaches here from a signature
   * `#selectSignature` already deemed satisfiable.
   */
  #validateToken(token: Token, chain: Token[], validated: Set<Registration>): void {
    if (isProviderToken(token)) {
      return;
    }
    const collection = collectionRequest(token);
    if (collection) {
      for (const registration of this.#collectionRegistrations(collection.element)) {
        this.#validateRegistration(collection.element, registration, chain, validated);
      }
      return;
    }
    const registration = this.#lookup(token);
    if (registration !== undefined) {
      this.#validateRegistration(token, registration, chain, validated);
      return;
    }
    const promiseToken = closeToken('Promise', token);
    const promiseRegistration = this.#lookup(promiseToken);
    if (promiseRegistration !== undefined) {
      this.#validateRegistration(promiseToken, promiseRegistration, chain, validated);
      return;
    }
    throw new UnregisteredTokenError(token);
  }

  // ── Disposal ────────────────────────────────────────────────────────────────

  /**
   * Closes this provider synchronously, disposing the instances its scope frame
   * owns in REVERSE construction order. Only native `Disposable` instances are
   * disposed. NO cascade to child scopes.
   *
   * Throws `AsyncDisposalRequiredError` if any owned instance is a Promise
   * (thenable) — a pending Promise cannot be disposed synchronously; the caller
   * must use `disposeAsync()`. (This pre-check runs BEFORE any disposal, so the
   * provider stays undisposed and `disposeAsync()` can still run everything.)
   * Idempotent: a second call is a no-op.
   *
   * A THROWING disposable never aborts its siblings' teardown: every owned
   * instance's disposal is attempted, and the collected failures are rethrown
   * afterwards — one failure as itself, several as one `AggregateError`.
   */
  public dispose(): void {
    if (this.#disposed) {
      return;
    }

    const owned = this.#frame?.owned ?? [];

    for (const instance of owned) {
      // A Pending (in-flight or settled — `owned` is never upgraded) and a raw
      // owned promise both demand disposeAsync. isThenable lives ONLY here in
      // disposal — the resolver proper has no thenable sniffing.
      if (isPending(instance) || isThenable(instance)) {
        throw new AsyncDisposalRequiredError();
      }
    }

    this.#disposed = true;
    const failures: unknown[] = [];
    for (let i = owned.length - 1; i >= 0; i--) {
      const instance = owned[i];
      if (isDisposable(instance)) {
        try {
          instance[Symbol.dispose]();
        } catch (err) {
          failures.push(err);
        }
      }
    }
    this.#clear();
    throwDisposalFailures(failures);
  }

  /**
   * Closes this provider asynchronously. Awaits each owned Promise-valued
   * instance first (so an async factory's result settles before teardown), then
   * disposes owned instances in REVERSE construction order — honoring both
   * `Symbol.asyncDispose` and `Symbol.dispose`. Idempotent.
   *
   * Same failure aggregation as `dispose()`: every disposal is attempted, one
   * collected failure rethrows as itself, several aggregate.
   */
  public async disposeAsync(): Promise<void> {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;

    const owned = this.#frame?.owned ?? [];

    // Resolve any in-flight (Pending) or Promise-valued instances to their
    // settled values so the disposer sees the real object, not the wrapper.
    const settled: unknown[] = [];
    for (const instance of owned) {
      // Guard each owned settle: a REJECTED owned Pending/thenable produced
      // nothing to dispose, and must not abort teardown of its siblings
      // (#disposed is already set, so an unguarded throw would leak every other
      // owned Disposable).
      if (isPending(instance)) {
        try {
          settled.push(await instance.promise);
        } catch {
          /* build rejected; nothing to dispose */
        }
      } else if (isThenable(instance)) {
        try {
          settled.push(await instance);
        } catch {
          /* build rejected; nothing to dispose */
        }
      } else {
        settled.push(instance);
      }
    }

    const failures: unknown[] = [];
    for (let i = settled.length - 1; i >= 0; i--) {
      const instance = settled[i];
      try {
        if (isAsyncDisposable(instance)) {
          await instance[Symbol.asyncDispose]();
        } else if (isDisposable(instance)) {
          instance[Symbol.dispose]();
        }
      } catch (err) {
        failures.push(err);
      }
    }
    this.#clear();
    throwDisposalFailures(failures);
  }

  /** Drops owned references after disposal so they can be collected, and marks
   * the frame closed so a still-live CHILD scope cannot cache into it. */
  #clear(): void {
    if (this.#frame) {
      this.#frame.disposed = true;
      this.#frame.cache.clear();
      this.#frame.owned.length = 0;
    }
  }

  /** Native `using` support — delegates to `dispose()`. */
  public [Symbol.dispose](): void {
    this.dispose();
  }

  /** Native `await using` support — delegates to `disposeAsync()`. */
  public [Symbol.asyncDispose](): Promise<void> {
    return this.disposeAsync();
  }
}
