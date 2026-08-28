import type { Registration } from '@rhombus-std/di.core';
import type { Type } from '@rhombus-std/primitives';
import type { ScopeProvider } from './ScopeProvider.js';

/**
 * One open scope of a lifetime model: what it has kept, the provider resolving from it, and the
 * model's own rule for which scope keeps a given registration.
 */
export abstract class Scope {
  /**
   * What each registration has already produced here, one entry per address it answered: two
   * registrations of one type stay apart, an open registration keeps one instance per closing, and
   * asking for a service alone or through a collection reaches the same entry.
   */
  readonly #instances = new Map<Registration<unknown>, Map<Type, unknown>>();

  /** The provider resolving from this scope, bound when that provider is minted. */
  provider: ScopeProvider | undefined;

  /**
   * The scope keeping what `registration` produces for `populatedAddress`, or `undefined` to
   * construct afresh every ask.
   */
  abstract selectOwningScope(registration: Registration<unknown>, populatedAddress: Type): Scope | undefined;

  /** The value `registration` already produced here for `populatedAddress`, absent when it has produced none. */
  findOwnedInstance(registration: Registration<unknown>, populatedAddress: Type): { result: unknown; } | undefined {
    const byRequest = this.#instances.get(registration);
    if (!byRequest?.has(populatedAddress)) {
      return undefined;
    }
    return { result: byRequest.get(populatedAddress) };
  }

  /** Holds `instance` as what `registration` answers here for `populatedAddress` from here on. */
  claimInstance(registration: Registration<unknown>, populatedAddress: Type, instance: unknown): void {
    this.#instances.getOrInsertComputed(registration, () => new Map()).set(populatedAddress, instance);
  }
}
