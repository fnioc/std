import type { Type } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';
import type { ServiceDescriptor } from '../ServiceDescriptor/index';

/**
 * The lifetime parameter's spelling for a vocabulary: omittable exactly when `undefined` is
 * assignable to `Lifetime`. Omission is not a special case — it is the value `undefined`, and it
 * compiles under the same assignability rule every other value answers to.
 */
export type LifetimeArgument<Lifetime> = undefined extends Lifetime ? [lifetime?: Lifetime] : [lifetime: Lifetime];

/**
 * The one callable governing instance reuse: the engine calls it at every realized site, and the
 * value it returns is the value the engine uses. Per-container machinery, minted by a
 * {@link LifetimeModel}'s {@link LifetimeModel.createRealizer | createRealizer}.
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
     * An opaque identity for THIS construction: the same object arrives on every repeat of the
     * same ask, and two registrations answering one type arrive as two distinct identities —
     * the natural key for an instance store.
     */
    site: object;
    /** The type as the resolver requested it. */
    serviceType: Type;
    /** The registration that answered, carrying the {@link ServiceDescriptor.lifetime | lifetime} this realizer interprets. */
    descriptor: ServiceDescriptor<Lifetime>;
    /**
     * Constructs the value. The realizer it receives governs every dependency constructed along
     * the way: pass a different one to change how the whole subtree behaves, or the receiver to
     * keep it.
     */
    make: Func<[Realizer<Lifetime>], unknown>;
  }): unknown;
}

/**
 * Genesis-time policy: what a container built on this model offers before any user
 * registration, and the per-container {@link Realizer} it mints to interpret lifetimes during
 * resolution.
 *
 * @typeParam Lifetime - the vocabulary of lifetime data this model interprets.
 */
export interface LifetimeModel<Lifetime = unknown> {
  /** What this model calls itself, so a failure can say which model refused. */
  readonly name: string;

  /** The model's own services — the scope machinery a provider on this model offers — as the floor beneath every user registration. */
  addModelServices(): Iterable<ServiceDescriptor<Lifetime>>;

  /** Mints the realizer a container built on this model resolves through, once per build. */
  createRealizer(): Realizer<Lifetime>;
}

import { noop as noopModel } from './models/noop';

export namespace LifetimeModel {
  export const noop = noopModel;
}
