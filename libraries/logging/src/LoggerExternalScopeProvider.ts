/// <reference path="./node-builtins.d.ts" />
// The default IExternalScopeProvider. Keeps the current scope in an
// `AsyncLocalStorage` (node:async_hooks), so pushing a scope threads a new node
// onto the ambient stack and it stays isolated across concurrent async flows;
// disposing a scope restores its parent.

import type { IExternalScopeProvider } from '@rhombus-std/logging.core';
import type { Func } from '@rhombus-toolkit/func';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * One node of the ambient scope stack: its state plus a link to its parent. On
 * dispose it hands the parent back to the provider's `restore` closure — so the
 * concrete `Scope` type never surfaces on the exported provider's API.
 */
class Scope implements Disposable {
  #isDisposed = false;

  public constructor(public readonly state: unknown, public readonly parent: Scope | undefined, private readonly restore: Func<[Scope | undefined], void>) {}

  public toString(): string {
    return this.state === undefined || this.state === null ? '' : String(this.state);
  }

  public [Symbol.dispose](): void {
    if (!this.#isDisposed) {
      this.restore(this.parent);
      this.#isDisposed = true;
    }
  }
}

/** Default implementation of {@link IExternalScopeProvider}. */
export class LoggerExternalScopeProvider implements IExternalScopeProvider {
  readonly #currentScope = new AsyncLocalStorage<Scope | undefined>();

  public constructor() {}

  public forEachScope<TState>(callback: Func<[unknown, TState], void>, state: TState): void {
    const report = (current: Scope | undefined): void => {
      if (current === undefined) {
        return;
      }
      report(current.parent);
      callback(current.state, state);
    };
    report(this.#currentScope.getStore());
  }

  public push(state: unknown): Disposable {
    const parent = this.#currentScope.getStore();
    const newScope = new Scope(state, parent, (restoreTo) => this.#currentScope.enterWith(restoreTo));
    this.#currentScope.enterWith(newScope);
    return newScope;
  }
}
