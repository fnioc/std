import type { Type } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';
import type { Registration } from '../Registration/index';

/**
 * The lifetime parameter's spelling for a vocabulary: omittable exactly when `undefined` is
 * assignable to `Lifetime`. Omission is not a special case — it is the value `undefined`, and it
 * compiles under the same assignability rule every other value answers to.
 */
export type LifetimeArgument<Lifetime> = undefined extends Lifetime ? [lifetime?: Lifetime] : [lifetime: Lifetime];

/** What a registration on the `standard` model says about reuse: one instance for the whole container, one per open scope, or a fresh one every ask. */
export type StandardLifetime = 'singleton' | 'scoped' | 'transient';

/** What a registration on the `tagged` model says about reuse: the tag of the scope keeping it, or `undefined` for transient. */
export type TaggedLifetime<Tags extends string = string> = Tags | undefined;

/**
 * The engine-facing face of a {@link LifetimeModel}.
 *
 * @typeParam Lifetime - the vocabulary of lifetime data this realizer interprets.
 */
export interface Realizer<Lifetime = unknown> {
  /**
   * Delivers the value for one construction — from storage, or by invoking `make`, at the
   * realizer's own discretion: a reuse hit simply never invokes `make`, and with it skips
   * everything the construction would have needed.
   */
  realize(construction: {
    /**
     * The identity of this position in the realizing walk: the same object arrives on every
     * repeat of the same ask, and each distinct position in the walk — even one sharing a
     * registration and a closing with another — has its own.
     */
    site: object;
    /**
     * The answering registration's address with whatever the match captured filled in — the only
     * record of which closing answered, so an open registration's several closings stay apart in
     * an instance store. Narrower than the caller's ask when that ask was a union or a
     * collection, since a member and an element each match on their own.
     */
    populatedAddress: Type;
    /** The registration that answered, carrying the {@link Registration.lifetime | lifetime} this realizer interprets. */
    registration: Registration<Lifetime>;
    /**
     * Constructs the value. The realizer it receives governs every dependency constructed along
     * the way: pass a different one to change how the whole subtree behaves, or the receiver to
     * keep it.
     */
    make: Func<[Realizer<Lifetime>], unknown>;
  }): unknown;
}

/**
 * A defined scope/lifetime pattern of behavior.
 *
 * @typeParam Lifetime - the vocabulary of lifetime data this model interprets.
 */
export interface LifetimeModel<Lifetime = unknown> {
  /** What this model calls itself, so a failure can say which model refused. */
  readonly name: string;

  /**
   * How this model spells "construct afresh, keep nothing" — the one reading every model has,
   * whatever vocabulary it draws on, so a registration that must never be reused can name it
   * without knowing which model it lands on.
   */
  readonly transient: Lifetime;

  /**
   * Mints one container's machinery, once per build: the {@link Realizer} every resolution runs
   * through, and the scope-opening capability the container publishes.
   *
   * @remarks
   * An absent `scopeFactory` means this model never scopes: the scope-opening address is simply
   * left unregistered, and comes back unsatisfiable the same way any other unregistered address
   * does. The registration is a factory taking `IServiceProvider`, which arrives as an ordinary
   * dependency — the provider a scope it opens defers to for anything the scope itself doesn't
   * keep. The factory's own args are the model's vocabulary for naming a scope as it opens,
   * which each model states in its own return type.
   */
  createRealizer(): {
    realizer: Realizer<Lifetime>;
    scopeFactory?: Registration<Lifetime>;
  };
}
