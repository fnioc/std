import type { IServiceProvider, Registration } from '@rhombus-std/di.core';
import { isThenable, Type } from '@rhombus-std/primitives';
import type { Action, Func } from '@rhombus-toolkit/func';
import { hasMember, isDefined, isFunction } from '@rhombus-toolkit/type-guards';
import { evictOnReject } from './evict-on-reject.js';

/** One instance a scope claimed: what produced it, the address it answers for, and the instance itself. */
export interface Claim {
  readonly registration: Registration<unknown>;
  readonly populatedAddress: Type;
  readonly instance: unknown;
}

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

  /** Every claim made here, in claim order, so teardown can release them newest first. */
  readonly #claims: Claim[] = [];

  /** Every scope opened beneath this one, in opening order, so teardown reaches them first. */
  readonly #children: Scope[] = [];

  /** Whether teardown has already run here. */
  #disposed = false;

  /** The provider resolving from this scope, bound when its binding mints it. */
  provider: IServiceProvider | undefined;

  /** Whether this scope has been torn down, so every later ask is refused. */
  get disposed(): boolean {
    return this.#disposed;
  }

  /**
   * The scope keeping what `registration` produces for `populatedAddress`, or `undefined` to
   * construct afresh every ask.
   */
  abstract selectOwningScope(registration: Registration<unknown>, populatedAddress: Type): Scope | undefined;

  /** The error this model raises for an ask that reached this scope after its teardown. */
  abstract mintDisposedError(address: Type): Error;

  /** The value `registration` already produced here for `populatedAddress`, absent when it has produced none. */
  findOwnedInstance(registration: Registration<unknown>, populatedAddress: Type): { result: unknown; } | undefined {
    const byRequest = this.#instances.get(registration);
    if (!byRequest?.has(populatedAddress)) {
      return undefined;
    }
    return { result: byRequest.get(populatedAddress) };
  }

  /** Records `child` as opened beneath this scope, so this scope's teardown reaches it first. */
  trackChild(child: Scope): void {
    this.#children.push(child);
  }

  /**
   * Holds `instance` as what `registration` answers here for `populatedAddress` from here on.
   *
   * @remarks
   * Whatever the construction produced is what is held, a promise included — so concurrent asks
   * share the one promise and the make behind it runs once. A promise that rejects is dropped
   * again, leaving the next ask free to retry.
   *
   * A claim landing after this scope's teardown is released straight away: the claim list it would
   * have joined has already drained, so nothing else would ever reach it.
   */
  claimInstance(registration: Registration<unknown>, populatedAddress: Type, instance: unknown): void {
    if (this.#disposed) {
      void releaseOnArrival(instance);
      return;
    }
    const byAddress = this.#instances.getOrInsertComputed(registration, () => new Map());
    byAddress.set(populatedAddress, instance);
    this.#claims.push({ registration, populatedAddress, instance });
    evictOnReject(instance, () => {
      if (byAddress.get(populatedAddress) === instance) {
        byAddress.delete(populatedAddress);
      }
    });
  }

  /**
   * Tears this scope down: every scope opened beneath it first, newest first, then every instance
   * it claimed, newest first.
   *
   * @remarks
   * A second teardown does nothing. Every release runs even where an earlier one threw, and the
   * failures surface together once the whole walk is over.
   *
   * @throws {AggregateError} carrying every failure a release raised.
   */
  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;

    const failures = new Array<Action>()
      .concat(this.#children.toReversed().map(child => () => child.dispose()))
      .concat(this.#drainClaims().map(claim => () => this.releaseInstance(claim)))
      .map(fn => {
        try {
          fn();
        } catch (error) {
          return [error];
        }
      })
      .filter(isDefined);

    if (failures.length) {
      throw new AggregateError(failures.flatMap(p => p), 'one or more instances failed to release');
    }
  }

  /**
   * Tears this scope down the way {@link dispose} does, awaiting each release in turn.
   *
   * @throws {AggregateError} carrying every failure a release raised.
   */
  async disposeAsync(): Promise<void> {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    const failures = await Array.fromAsync(async function*(this: Scope) {
      const tasks = new Array<Func<[], Promise<void>>>()
        .concat(this.#children.toReversed().map(child => () => child.disposeAsync()))
        .concat(this.#drainClaims().map(claim => () => this.releaseInstanceAsync(claim)));

      // can't map the tasks like I did in the sync version because these Promise versions would execute in parallel and order matters here
      for (const task of tasks) {
        try {
          await task();
        } catch (error) {
          yield error;
        }
      }
    }.call(this));

    if (failures.length) {
      throw new AggregateError(failures, 'one or more instances failed to release');
    }
  }

  /**
   * Releases one instance this scope claimed, awaiting whatever its disposal protocol returns.
   *
   * @remarks
   * Override to give a registration a release of the model's own choosing.
   */
  protected releaseInstanceAsync(claim: Claim): Promise<void> {
    return disposeInstanceAsync(claim.instance);
  }

  /**
   * Releases one instance this scope claimed, with nothing to await it.
   *
   * @remarks
   * Override alongside {@link releaseInstanceAsync}.
   *
   * @throws {TypeError} when the instance offers no synchronous disposal.
   */
  protected releaseInstance(claim: Claim): void {
    disposeInstance(claim.populatedAddress, claim.instance);
  }

  /** Empties the claim list, answering it newest first with each instance reference appearing once. */
  #drainClaims(): Claim[] {
    const released = new Set<unknown>();
    return this.#claims.splice(0).reverse().filter(claim => {
      if (released.has(claim.instance)) {
        return false;
      }
      released.add(claim.instance);
      return true;
    });
  }
}

/** The disposal function `instance` carries under `protocol`, absent when it carries none. */
function getDispose(instance: unknown, protocol: symbol): Func | undefined {
  if (!hasMember(instance, protocol)) {
    return undefined;
  }
  const disposer = instance[protocol];
  return isFunction(disposer) ? disposer : undefined;
}

/**
 * Releases `instance` through whichever disposal protocol it carries, the asynchronous one first.
 *
 * @remarks
 * A promise product is released by awaiting it and releasing what it settled on; one that rejected
 * produced no instance at all, so there is nothing left to release.
 */
async function disposeInstanceAsync(instance: unknown): Promise<void> {
  if (isThenable(instance)) {
    return disposeInstanceAsync(await instance.then(settled => settled, () => undefined));
  }
  const releaseAsync = getDispose(instance, Symbol.asyncDispose);
  if (releaseAsync) {
    await releaseAsync.call(instance);
    return;
  }
  getDispose(instance, Symbol.dispose)?.call(instance);
}

/**
 * Releases `instance` through its synchronous disposal protocol.
 *
 * @remarks
 * A promise product is released once it settles, since a synchronous teardown has no way to wait
 * for it.
 *
 * @throws {TypeError} when the instance carries only the asynchronous protocol.
 */
function disposeInstance(populatedAddress: Type, instance: unknown): void {
  if (isThenable(instance)) {
    void releaseOnArrival(instance);
    return;
  }
  const releaseSync = getDispose(instance, Symbol.dispose);
  if (releaseSync) {
    releaseSync.call(instance);
    return;
  }
  if (getDispose(instance, Symbol.asyncDispose)) {
    throw new TypeError(`a synchronous dispose cannot release ${Type.stringify(populatedAddress)} — it carries only Symbol.asyncDispose`);
  }
}

/** Releases `instance` the moment it arrives, where the teardown that would have released it has already returned. */
async function releaseOnArrival(instance: unknown): Promise<void> {
  try {
    await disposeInstanceAsync(instance);
  } catch {
    // The scope is torn down and its teardown has returned: nobody is left to hand this failure to.
  }
}
