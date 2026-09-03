import { type IServiceProvider, ObjectDisposedError, type Registration } from '@rhombus-std/di.core';
import type { Type } from '@rhombus-std/primitives';

/**
 * One scope's state under the standard lifetime model: what it caches, what it owns, and whether
 * it has ended. The container's own scope holds the singletons; every `openScope()` mints another.
 */
export interface Scope {
  /** By registration identity, then by populated address — one entry per closing of an open registration, one per registration of a shared address. */
  readonly cache: Map<Registration<unknown>, Map<Type, unknown>>;
  /** Every disposable instance this scope owns, in capture order. */
  readonly disposables: unknown[];
  /** The provider asks under this scope answer for `IServiceProvider`. */
  provider: IServiceProvider | undefined;
  disposed: boolean;
}

export function newScope(): Scope {
  return { cache: new Map(), disposables: [], provider: undefined, disposed: false };
}

/** The cached instance for `registration` at `address`, as a hit or a miss. */
export function lookup(scope: Scope, registration: Registration<unknown>, address: Type): { readonly hit: true; readonly value: unknown; } | { readonly hit: false; } {
  const entries = scope.cache.get(registration);
  if (entries !== undefined && entries.has(address)) {
    return { hit: true, value: entries.get(address) };
  }
  return MISS;
}

const MISS = { hit: false } as const;

export function store(scope: Scope, registration: Registration<unknown>, address: Type, value: unknown): void {
  let entries = scope.cache.get(registration);
  if (entries === undefined) {
    entries = new Map();
    scope.cache.set(registration, entries);
  }
  entries.set(address, value);
}

/** Drops the entry for `registration` at `address` when it still holds `value`. */
export function evict(scope: Scope, registration: Registration<unknown>, address: Type, value: unknown): void {
  const entries = scope.cache.get(registration);
  if (entries !== undefined && entries.get(address) === value) {
    entries.delete(address);
  }
}

/**
 * Files `instance` for disposal with `scope` when it can be disposed at all.
 *
 * @throws {ObjectDisposedError} when the scope has already ended — the instance is disposed at
 * once rather than leaked, and the ask that produced it gets nothing back.
 */
export function capture(scope: Scope, instance: unknown): void {
  if (!isDisposable(instance) && !isAsyncDisposable(instance)) {
    return;
  }
  if (scope.disposed) {
    disposeAtOnce(instance);
    throw new ObjectDisposedError();
  }
  scope.disposables.push(instance);
}

/**
 * Ends `scope`: every instance it owns is disposed synchronously, most recently captured first,
 * each once however many times it was captured. A second call does nothing.
 *
 * @throws The one error disposal raised, as itself; several as one `AggregateError`. An instance
 * offering only `Symbol.asyncDispose` is left undisposed and counted as an error.
 */
export function disposeScope(scope: Scope): void {
  const owned = end(scope);
  if (owned === undefined) {
    return;
  }
  const errors: unknown[] = [];
  for (const instance of owned) {
    try {
      if (isDisposable(instance)) {
        instance[Symbol.dispose]();
      } else {
        errors.push(new Error(`${describe(instance)} implements only Symbol.asyncDispose; dispose the provider with Symbol.asyncDispose instead`));
      }
    } catch (error) {
      errors.push(error);
    }
  }
  rethrow(errors);
}

/**
 * Ends `scope`: every instance it owns is disposed, most recently captured first, each once
 * however many times it was captured — awaited when it offers `Symbol.asyncDispose`, called
 * synchronously otherwise. A second call does nothing.
 *
 * @throws The one error disposal raised, as itself; several as one `AggregateError`.
 */
export async function disposeScopeAsync(scope: Scope): Promise<void> {
  const owned = end(scope);
  if (owned === undefined) {
    return;
  }
  const errors: unknown[] = [];
  for (const instance of owned) {
    try {
      if (isAsyncDisposable(instance)) {
        await instance[Symbol.asyncDispose]();
      } else if (isDisposable(instance)) {
        instance[Symbol.dispose]();
      }
    } catch (error) {
      errors.push(error);
    }
  }
  rethrow(errors);
}

/**
 * Marks `scope` ended and answers what to dispose, in disposal order — or `undefined` when it had
 * already ended. Duplicates keep their first position, so an instance captured under several
 * addresses disposes once, where it was first captured.
 */
function end(scope: Scope): readonly unknown[] | undefined {
  if (scope.disposed) {
    return undefined;
  }
  scope.disposed = true;
  const owned = Array.from(new Set(scope.disposables)).reverse();
  scope.disposables.length = 0;
  return owned;
}

function rethrow(errors: readonly unknown[]): void {
  if (errors.length === 1) {
    throw errors[0];
  }
  if (errors.length > 1) {
    throw new AggregateError(errors, `disposing the scope failed for ${errors.length} instances`);
  }
}

/** Disposes an instance that arrived after its owner ended, preferring the synchronous protocol. */
function disposeAtOnce(instance: Disposable | AsyncDisposable): void {
  if (isDisposable(instance)) {
    instance[Symbol.dispose]();
    return;
  }
  void Promise.resolve((instance as AsyncDisposable)[Symbol.asyncDispose]()).catch(() => undefined);
}

export function isDisposable(instance: unknown): instance is Disposable {
  return typeof instance === 'object' && instance !== null && typeof (instance as Disposable)[Symbol.dispose] === 'function';
}

export function isAsyncDisposable(instance: unknown): instance is AsyncDisposable {
  return typeof instance === 'object' && instance !== null && typeof (instance as AsyncDisposable)[Symbol.asyncDispose] === 'function';
}

function describe(instance: unknown): string {
  const name = typeof instance === 'object' && instance !== null ? instance.constructor?.name : undefined;
  return name ? `an instance of ${name}` : 'an instance';
}
