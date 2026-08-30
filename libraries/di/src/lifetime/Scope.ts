import type { IServiceProvider, Registration } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';
import { hasMember, isDefined, isFunction, isPromiseLike } from '@rhombus-toolkit/type-guards';
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

  /** Every scope opened beneath this one: each joins as it is constructed and leaves as its own teardown completes. */
  readonly #children = new Set<Scope>();

  /** The scope this one was opened inside, absent for a root. */
  readonly #parent: Scope | undefined;

  /** Whether teardown has already run here. */
  #disposed = false;

  /** The provider resolving from this scope, absent until its binding mints it. */
  #provider: IServiceProvider | undefined;

  constructor(parent?: Scope) {
    this.#parent = parent;
    if (parent) {
      parent.#children.add(this);
    }
  }

  /** The provider resolving from this scope, bound once by its binding. */
  get provider(): IServiceProvider | undefined {
    return this.#provider;
  }

  /**
   * Binds the provider resolving from this scope.
   *
   * @throws {TypeError} when this scope is already bound.
   */
  bindProvider(provider: IServiceProvider): void {
    if (this.#provider) {
      throw new TypeError('this scope is already bound to a provider');
    }
    this.#provider = provider;
  }

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

  /**
   * Holds `instance` as what `registration` answers here for `populatedAddress` from here on.
   *
   * @remarks
   * Whatever the construction produced is what is held, a promise included — so concurrent asks
   * share the one promise and the make behind it runs once. A promise that rejects is dropped
   * again, leaving the next ask free to retry.
   *
   * Only what the scope can reach is tracked for release: a promise handed back by a synchronous
   * resolve — a thenable answering an address that is not itself promise-like — is the caller's to
   * settle and dispose, so it is remembered as the answer but never released here. A claim landing
   * after this scope's teardown is dropped, its holder owning whatever it produced.
   */
  claimInstance(registration: Registration<unknown>, populatedAddress: Type, instance: unknown): void {
    if (this.#disposed) {
      return;
    }
    const byAddress = this.#instances.getOrInsertComputed(registration, () => new Map());
    byAddress.set(populatedAddress, instance);
    if (withinReach(populatedAddress, instance)) {
      this.#claims.push({ registration, populatedAddress, instance });
    }
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

    try {
      const failures = this.#drainTeardown()
        .map(step => {
          try {
            if (step instanceof Scope) {
              step.dispose();
            } else {
              this.releaseInstance(step);
            }
          } catch (error) {
            return [error];
          }
        })
        .filter(isDefined)
        .toArray();

      if (failures.length) {
        throw new AggregateError(failures.flatMap(p => p), 'one or more instances failed to release');
      }
    } finally {
      this.#detachFromParent();
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

    try {
      // The steps run in turn: release order is reverse dependency order.
      const failures = await Array.fromAsync(async function*(this: Scope) {
        for (const step of this.#drainTeardown()) {
          try {
            if (step instanceof Scope) {
              await step.disposeAsync();
            } else {
              await this.releaseInstanceAsync(step);
            }
          } catch (error) {
            yield error;
          }
        }
      }.call(this));

      if (failures.length) {
        throw new AggregateError(failures, 'one or more instances failed to release');
      }
    } finally {
      this.#detachFromParent();
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

  /** Removes this scope from its parent's child set. */
  #detachFromParent(): void {
    if (this.#parent) {
      this.#parent.#children.delete(this);
    }
  }

  /** Every scope opened beneath this one, newest first, then every instance claimed here, newest first. */
  *#drainTeardown(): Generator<Scope | Claim> {
    yield* [...this.#children].reverse();
    yield* this.#drainKept();
  }

  /** Empties what this scope kept, returning its claims newest first with each instance appearing once. */
  #drainKept(): Claim[] {
    this.#instances.clear();
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

/**
 * Whether `instance` is something the scope can release: a thenable answering an address that is
 * not itself promise-like was handed back unawaited by a synchronous resolve, so it is out of
 * reach and its holder owns what it settles to.
 */
function withinReach(populatedAddress: Type, instance: unknown): boolean {
  return !isPromiseLike(instance) || Type.isPromiseLike(populatedAddress);
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
  if (isPromiseLike(instance)) {
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
 * A promise product in reach settles to its value only asynchronously, which a synchronous
 * teardown cannot wait for, so it is refused the same way an async-only disposable is.
 *
 * @throws {TypeError} when the instance is a promise product, or carries only the asynchronous protocol.
 */
function disposeInstance(populatedAddress: Type, instance: unknown): void {
  if (isPromiseLike(instance)) {
    throw new TypeError(`a synchronous dispose cannot release ${Type.stringify(populatedAddress)} — it settles to its value only through an asynchronous release`);
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
