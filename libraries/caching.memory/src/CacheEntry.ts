// CacheEntry -- the internal ICacheEntry implementation, ported from
// ME.Caching.Memory's internal `CacheEntry` (+ CacheEntry.CacheEntryTokens).
//
// Disposing the entry COMMITS it to the owning cache (via the host's
// `setEntry`). Simplifications vs the reference runtime (JS is single-threaded,
// so the Interlocked machinery is unnecessary):
//   - Eviction callbacks and token-expiry run SYNCHRONOUSLY, not on a
//     background Task.
//   - Durations are milliseconds; the absolute expiration is an epoch-ms
//     number internally (`-1` = unset), surfaced as a `Date` on the interface.
//
// LINKED-ENTRY TRACKING (`MemoryCacheOptions.trackLinkedCacheEntries`). The
// reference keeps the "entry currently being created" in a static
// `AsyncLocal<CacheEntry>` slot: constructing an entry pushes it, disposing
// pops back to the remembered previous, and reads/commits inside that window
// propagate expiration tokens and earlier absolute expirations to the pending
// parent. Here the slot is a MODULE-SCOPED variable (the `static` analog) with
// the same push/pop chain -- equivalent to the reference for every
// synchronous create->...->dispose window, which single-threaded JS executes
// without interleaving. It is NOT an async-context slot: this platform's
// `AsyncLocalStorage` cannot reproduce the reference semantics. The only
// mutate-in-place API, `enterWith`, (a) segfaults the pinned bun runtime
// (1.3.14) when called after any `await` (bun.report id la10d9b296, verified
// 2026-07-11), and (b) even under correct engine semantics cannot express the
// dispose-time POP: a store replaced after an `await` never restores the
// awaiting caller's context (the platform lacks the reference's
// restore-context-on-async-method-exit), so sequential async flows chain onto
// each other's already-committed entries -- strictly WORSE than the plain
// module variable, which pops correctly for every non-interleaved flow. The
// residual divergence: cache operations interleaved from OTHER async flows
// while a tracking entry is pending across an `await` see (and propagate to)
// that pending entry, where the reference isolates per async flow.
//
// This class is internal -- reachable only through the `internal/*` export
// subpath, not the package barrel.

import { CacheItemPriority, EvictionReason, type ICacheEntry,
  type PostEvictionCallbackRegistration } from '@rhombus-std/caching.core';
import { type ILogger, logError } from '@rhombus-std/logging.core';
import { augment, type IChangeToken } from '@rhombus-std/primitives';
import { nameof } from '@rhombus-std/primitives';

/**
 * The owning-cache surface a {@link CacheEntry} needs. {@link MemoryCache}
 * satisfies it. Kept as an interface here so cache-entry does not import
 * MemoryCache (which imports cache-entry) -- breaking the cycle at the type
 * level.
 */
export interface IMemoryCacheHost {
  /** Commits `entry` into the cache (called from {@link CacheEntry.dispose}). */
  setEntry(entry: CacheEntry): void;

  /** Notifies the cache that `entry` expired via one of its tokens. */
  entryExpired(entry: CacheEntry): void;

  /** The logger used to report eviction-callback failures. */
  readonly logger: ILogger;

  /** Whether linked (nested) cache entries are tracked (see the module doc). */
  readonly trackLinkedCacheEntries: boolean;
}

/**
 * The ambient "entry currently being created" -- the module-scoped analog of
 * the reference's static async-local slot (see the module doc for why it is a
 * plain variable). `undefined` when no tracking entry is pending.
 */
let ambientCurrentEntry: CacheEntry | undefined = undefined;

/** The pending ambient entry, exposed for white-box tests (the reference's internal `Current`). */
export function currentCacheEntry(): CacheEntry | undefined {
  return ambientCurrentEntry;
}

// Interface-extends merge (augmentation doctrine): binding the ICacheEntry SYMBOL
// flows every in-program augmentation of the interface (caching.core's
// setPriority/setAbsoluteExpiration/… fluent wrappers) onto this concrete holder,
// so it satisfies `implements ICacheEntry` without restating any member.
export interface CacheEntry extends ICacheEntry {}

/** The concrete cache entry. Committed to its cache on dispose. */
@augment(nameof<ICacheEntry>())
export class CacheEntry implements ICacheEntry {
  readonly #host: IMemoryCacheHost;
  readonly #key: unknown;

  #value: unknown = undefined;
  #isValueSet = false;

  /** Absolute expiration as epoch ms; `-1` = unset. */
  #absoluteMs = -1;
  /** Absolute-relative-to-now duration in ms; `0` = unset. */
  #absoluteRelativeMs = 0;
  /** Sliding-expiration duration in ms; `0` = unset. */
  #slidingMs = 0;
  /** Entry size; `-1` = unset. */
  #size = -1;
  #priority: CacheItemPriority = CacheItemPriority.Normal;

  #expirationTokens: IChangeToken[] | undefined = undefined;
  #postEvictionCallbacks: PostEvictionCallbackRegistration[] | undefined = undefined;
  #tokenRegistrations: Disposable[] | undefined = undefined;

  /**
   * The pending entry this one was nested under at creation time; only set
   * before this entry is added to the cache, and only when tracking is on.
   */
  #previous: CacheEntry | undefined = undefined;

  #isExpired = false;
  #isDisposed = false;
  #evictionReason: EvictionReason = EvictionReason.None;

  /** Wall-clock (epoch ms) of the last hit; drives sliding expiration. */
  public lastAccessed = 0;

  public constructor(key: unknown, host: IMemoryCacheHost) {
    this.#key = key;
    this.#host = host;
    if (host.trackLinkedCacheEntries) {
      this.#previous = ambientCurrentEntry;
      ambientCurrentEntry = this;
    }
  }

  // -- ICacheEntry surface --------------------------------------------------

  public get key(): unknown {
    return this.#key;
  }

  public get value(): unknown {
    return this.#value;
  }

  public set value(value: unknown) {
    this.#value = value;
    this.#isValueSet = true;
  }

  public get absoluteExpiration(): Date | undefined {
    return this.#absoluteMs < 0 ? undefined : new Date(this.#absoluteMs);
  }

  public set absoluteExpiration(value: Date | undefined) {
    this.#absoluteMs = value === undefined ? -1 : value.getTime();
  }

  public get absoluteExpirationRelativeToNow(): number | undefined {
    return this.#absoluteRelativeMs === 0 ? undefined : this.#absoluteRelativeMs;
  }

  public set absoluteExpirationRelativeToNow(value: number | undefined) {
    if (value !== undefined && value <= 0) {
      throw new RangeError(`absoluteExpirationRelativeToNow must be positive, was ${value}.`);
    }
    this.#absoluteRelativeMs = value ?? 0;
  }

  public get slidingExpiration(): number | undefined {
    return this.#slidingMs === 0 ? undefined : this.#slidingMs;
  }

  public set slidingExpiration(value: number | undefined) {
    if (value !== undefined && value <= 0) {
      throw new RangeError(`slidingExpiration must be positive, was ${value}.`);
    }
    this.#slidingMs = value ?? 0;
  }

  public get expirationTokens(): IChangeToken[] {
    return (this.#expirationTokens ??= []);
  }

  public get postEvictionCallbacks(): PostEvictionCallbackRegistration[] {
    return (this.#postEvictionCallbacks ??= []);
  }

  public get priority(): CacheItemPriority {
    return this.#priority;
  }

  public set priority(value: CacheItemPriority) {
    this.#priority = value;
  }

  public get size(): number | undefined {
    return this.#size < 0 ? undefined : this.#size;
  }

  public set size(value: number | undefined) {
    if (value !== undefined && value < 0) {
      throw new RangeError(`size must be non-negative, was ${value}.`);
    }
    this.#size = value ?? -1;
  }

  /** Commits the entry to its cache. */
  public [Symbol.dispose](): void {
    if (this.#isDisposed) {
      return;
    }
    this.#isDisposed = true;
    if (this.#host.trackLinkedCacheEntries) {
      this.#commitWithTracking();
    } else if (this.#isValueSet) {
      // Only commit if a value was actually assigned: a create-then-throw path
      // (e.g. a getOrCreate factory that throws) must not poison the cache.
      this.#host.setEntry(this);
    }
  }

  #commitWithTracking(): void {
    // Pop the ambient slot back to the remembered previous. The reference
    // asserts LIFO dispose order and pops unconditionally; mirrored here.
    ambientCurrentEntry = this.#previous;

    // Don't commit or propagate options if the value was never set -- we
    // assume an error kept the caller from setting it, so the entry is
    // abandoned.
    if (this.#isValueSet) {
      this.#host.setEntry(this);

      const parent = this.#previous;
      if (parent !== undefined) {
        this.#propagateOptionsTo(parent);
      }
    }

    this.#previous = undefined; // don't root the chain
  }

  // -- internal surface (used by MemoryCache; not on ICacheEntry) -----------

  /** The raw size (`-1` when unset), for capacity accounting. */
  public get sizeValue(): number {
    return this.#size;
  }

  /** The raw relative-expiration duration in ms (`0` when unset). */
  public get absoluteRelativeRaw(): number {
    return this.#absoluteRelativeMs;
  }

  /** The absolute expiration as epoch ms (`-1` when unset). */
  public get absoluteExpirationMs(): number {
    return this.#absoluteMs;
  }

  public set absoluteExpirationMs(value: number) {
    this.#absoluteMs = value;
  }

  public get evictionReason(): EvictionReason {
    return this.#evictionReason;
  }

  public get isValueSet(): boolean {
    return this.#isValueSet;
  }

  /**
   * Returns `true` if the entry is expired as of `utcNow` (epoch ms), marking
   * it expired (and detaching its tokens) as a side effect.
   */
  public checkExpired(utcNow: number): boolean {
    if (this.#isExpired) {
      return true;
    }
    if (this.#checkForExpiredTime(utcNow)) {
      return true;
    }
    const tokens = this.#expirationTokens;
    if (tokens) {
      for (const token of tokens) {
        if (token.hasChanged) {
          this.setExpired(EvictionReason.TokenExpired);
          return true;
        }
      }
    }
    return false;
  }

  #checkForExpiredTime(utcNow: number): boolean {
    if (this.#absoluteMs < 0 && this.#slidingMs === 0) {
      return false;
    }
    if (this.#absoluteMs >= 0 && this.#absoluteMs <= utcNow) {
      this.setExpired(EvictionReason.Expired);
      return true;
    }
    if (this.#slidingMs > 0 && utcNow - this.lastAccessed >= this.#slidingMs) {
      this.setExpired(EvictionReason.Expired);
      return true;
    }
    return false;
  }

  /** Marks the entry expired with `reason` (first reason wins) and detaches tokens. */
  public setExpired(reason: EvictionReason): void {
    if (this.#evictionReason === EvictionReason.None) {
      this.#evictionReason = reason;
    }
    this.#isExpired = true;
    this.#detachTokens();
  }

  /** Subscribes to each active-callback expiration token so a fire evicts the entry. */
  public attachTokens(): void {
    const tokens = this.#expirationTokens;
    if (!tokens) {
      return;
    }
    for (const token of tokens) {
      if (token.activeChangeCallbacks) {
        const registration = token.registerChangeCallback(() => {
          this.setExpired(EvictionReason.TokenExpired);
          this.#host.entryExpired(this);
        }, undefined);
        (this.#tokenRegistrations ??= []).push(registration);
      }
    }
  }

  #detachTokens(): void {
    const registrations = this.#tokenRegistrations;
    if (!registrations) {
      return;
    }
    this.#tokenRegistrations = undefined;
    for (const registration of registrations) {
      registration[Symbol.dispose]();
    }
  }

  /**
   * Propagates this (committed) entry's expiration options to the pending
   * ambient entry, if there is one -- called by the cache on a hit while
   * linked-entry tracking is on, so an entry created around the read expires
   * with the value it depends on.
   */
  public propagateOptionsToCurrent(): void {
    // Nothing to propagate, or no pending parent.
    if (
      ((this.#expirationTokens === undefined || this.#expirationTokens.length === 0)
        && this.#absoluteMs < 0)
      || ambientCurrentEntry === undefined
    ) {
      return;
    }
    // Copy regardless of whether the parent ends up cached: the tokens are
    // associated with the value being returned.
    this.#propagateOptionsTo(ambientCurrentEntry);
  }

  /** Copies an earlier absolute expiration and the expiration tokens to `parent`. */
  #propagateOptionsTo(parent: CacheEntry): void {
    if (this.#absoluteMs >= 0 && (parent.#absoluteMs < 0 || this.#absoluteMs < parent.#absoluteMs)) {
      parent.#absoluteMs = this.#absoluteMs;
    }
    if (this.#expirationTokens !== undefined && this.#expirationTokens.length > 0) {
      parent.expirationTokens.push(...this.#expirationTokens);
    }
  }

  /** Fires each post-eviction callback once. Swallows and logs callback errors. */
  public invokeEvictionCallbacks(): void {
    const callbacks = this.#postEvictionCallbacks;
    if (!callbacks || callbacks.length === 0) {
      return;
    }
    // Consume once: a later re-invocation (e.g. remove after capacity evict)
    // must not re-fire callbacks.
    this.#postEvictionCallbacks = undefined;
    for (const registration of callbacks) {
      try {
        registration.evictionCallback?.(this.#key, this.#value, this.#evictionReason, registration.state);
      } catch (error) {
        logError(
          this.#host.logger,
          error instanceof Error ? error : new Error(String(error)),
          'EvictionCallback invoked failed',
        );
      }
    }
  }
}
