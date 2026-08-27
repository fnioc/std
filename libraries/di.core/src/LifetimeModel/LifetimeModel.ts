import type { Type } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';
import type { IServiceProvider } from '../IServiceProvider';
import type { Registration } from '../Registration/index';

/** Lets the lifetime argument be omitted entirely when `undefined` is in the vocabulary. */
export type LifetimeArgument<Lifetime> = undefined extends Lifetime ? [lifetime?: Lifetime] : [lifetime: Lifetime];

/** Lifetime options for the `standard` model. */
export type StandardLifetime = 'singleton' | 'scoped' | 'transient';

/** Lifetime options for the `tagged` model. */
export type TaggedLifetime<Tags extends string = string> = Tags | undefined;

/**
 * A defined pattern of behavior for how long a construction is kept and what keeps it.
 *
 * @typeParam Lifetime - the vocabulary of lifetime data this model interprets.
 */
export interface LifetimeModel<Lifetime = unknown> {
  /** What this model calls itself. */
  readonly name: string;

  /** This model's value for "construct afresh, keep nothing". */
  readonly transient: Lifetime;

  /**
   * Mints one container's machinery: how this model wraps the container's resolutions, and the
   * registration it publishes for opening a nested container.
   *
   * @remarks
   * `wrapResolve` is called once, at build, with the handler it wraps and the container that will
   * answer through the handler it returns; that handler then serves every request. An absent
   * `wrapResolve` means this model wraps nothing and the container answers with the provider built
   * for it; an absent `scopeFactory` means this model opens nothing.
   */
  install(): {
    wrapResolve?: Func<[Func<[Type], unknown>, IServiceProvider], Func<[Type], unknown>>;
    scopeFactory?: Registration<Lifetime>;
  };
}

/**
 * One construction the engine is performing.
 *
 * @typeParam Lifetime - the vocabulary of lifetime data the reading handlers interpret.
 * @typeParam Context - the shape of the context these handlers thread through a resolution.
 */
export interface Construction<Lifetime = unknown, Context = unknown> {
  /** This node's position in the resolution: one per node, referentially stable, opaque. */
  readonly site: object;
  /** The address this site answers, as it was requested, with any captures filled in. */
  readonly populatedAddress: Type;
  /** The registration that matched, absent when the engine rather than the manifest is answering. */
  readonly registration?: Registration<Lifetime>;
  /** The context the enclosing construction placed this one under — never this node's own answer. */
  readonly context: Context;
}

/** What a pre-construction handler answers: an instance in place of constructing, or the context this construction's dependencies resolve under — `undefined` placing them under none. */
export type Interception<Context = unknown> =
  | { readonly instance: unknown; }
  | { readonly within: Context | undefined; };

/**
 * Opens one resolution, answering the context its constructions start under.
 *
 * @typeParam Context - the shape of the context threaded through the resolution.
 */
export type BeginResolveHandler<Context = unknown> = Func<[request: Type, injected: Context], Context>;

/** A {@link BeginResolveHandler} owning its chain: `next` is everything registered downstream of it. */
export type BeginResolveMiddleware<Context = unknown> = Func<[request: Type, injected: Context, next: BeginResolveHandler<Context>], Context>;

/** Runs before the engine constructs, answering an instance in place of constructing or the context the dependencies resolve under. */
export type BeforeConstructHandler<Lifetime = unknown, Context = unknown> = Func<[construction: Construction<Lifetime, Context>], Interception<Context>>;

/** A {@link BeforeConstructHandler} owning its chain: `next` is everything registered downstream of it. */
export type BeforeConstructMiddleware<Lifetime = unknown, Context = unknown> = Func<
  [construction: Construction<Lifetime, Context>, next: BeforeConstructHandler<Lifetime, Context>],
  Interception<Context>
>;

/**
 * Swaps the instance the engine has just constructed for the one this handler answers — a proxy, a
 * frozen copy, a decorator — everything downstream reading what it returns.
 *
 * @remarks
 * Runs only where the engine BUILT: a {@link BeforeConstructHandler} that supplied an instance
 * skips it entirely. The engine hands over the raw product and takes back whatever is answered: it
 * never tests for a thenable, never awaits, and never unwraps, so a construction that produced a
 * pending promise arrives here as that promise.
 */
export type CanonicalizeHandler<Lifetime = unknown, Context = unknown> = Func<[construction: Construction<Lifetime, Context>, instance: unknown], unknown>;

/** A {@link CanonicalizeHandler} owning its chain: `next` is everything registered downstream of it. */
export type CanonicalizeMiddleware<Lifetime = unknown, Context = unknown> = Func<
  [construction: Construction<Lifetime, Context>, instance: unknown, next: CanonicalizeHandler<Lifetime, Context>],
  unknown
>;

/** Runs once the engine has constructed, on the instance as it stands — never awaited, never unwrapped. */
export type AfterConstructHandler<Lifetime = unknown, Context = unknown> = Func<[construction: Construction<Lifetime, Context>, instance: unknown], void>;

/** An {@link AfterConstructHandler} owning its chain: `next` is everything registered downstream of it. */
export type AfterConstructMiddleware<Lifetime = unknown, Context = unknown> = Func<
  [construction: Construction<Lifetime, Context>, instance: unknown, next: AfterConstructHandler<Lifetime, Context>],
  void
>;

/**
 * What one registered handler asks to be spared.
 *
 * @typeParam Lifetime - the vocabulary of lifetime data the predicate reads.
 */
export interface HookOptions<Lifetime = unknown> {
  /**
   * Whether the handler has anything to say about a node, asked once per registration — or, for a
   * node no registration stands behind, once per address.
   *
   * @remarks
   * A `false` verdict passes the node straight to the next handler in the chain. Declaring the
   * predicate is an optimization and never a correctness step for a plain handler: one that
   * declares none is asked about nothing and runs everywhere, so every handler has to be right on
   * its own. Middleware never consults this predicate — it already receives the construction
   * directly and `next` besides, so it decides for itself whether it has anything to do. The
   * verdict is remembered per registration, so a predicate pruning an open registration that
   * answers several addresses must decide from the registration alone.
   */
  interested?(registration: Registration<Lifetime> | undefined, address: Type): boolean;
}

/**
 * The four handlers the engine holds, one apiece and every one of them present: whatever was
 * registered is composed into these before the engine ever sees it.
 *
 * @typeParam Lifetime - the vocabulary of lifetime data these handlers interpret.
 * @typeParam Context - the shape of the context they thread through a resolution.
 */
export interface Hooks<Lifetime = unknown, Context = unknown> {
  readonly beginResolve: BeginResolveHandler<Context>;
  readonly beforeConstruct: BeforeConstructHandler<Lifetime, Context>;
  readonly canonicalize: CanonicalizeHandler<Lifetime, Context>;
  readonly afterConstruct: AfterConstructHandler<Lifetime, Context>;
}

/** Classifies registrations into the conventional lifetime vocabulary a validator reasons over. */
export interface LifetimePolicy {
  /** The lifetime `registration` carries, `undefined` when it carries none this policy reads. */
  classify(registration: Registration<unknown> | undefined): StandardLifetime | undefined;
}
