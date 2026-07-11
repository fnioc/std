// CompositeChangeToken -- a minimal composite over several IChangeTokens, kept
// internal to this package.
//
// An assembled reactive `Options<MetricsOptions>` / `Options<TracingOptions>` may
// watch MULTIPLE change-token sources (e.g. two addConfiguration calls binding
// two sections). `Options.watch` takes ONE producer, so the sources' tokens
// compose into one token that has changed when any child has, and registers a
// callback against every child.
//
// NOTE: this duplicates @rhombus-std/options.augmentations's own internal
// CompositeChangeToken. That class's comment already anticipates the composite
// being promoted into @rhombus-std/primitives "once a second consumer needs it";
// diagnostics is now that second consumer, so the correct follow-up is to promote
// ONE CompositeChangeToken into primitives and delete both copies (out of scope
// for this pass -- see the package tbd notes). The local copy keeps this package's
// boundaries clean in the meantime (no cross-package internal/* reach).

import type { IChangeToken } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';

/**
 * An {@link IChangeToken} over a set of child tokens: {@link hasChanged} when any
 * child has, and a callback registered against it fires when any child fires.
 * Disposing the registration unregisters from every child.
 */
export class CompositeChangeToken implements IChangeToken {
  readonly #tokens: readonly IChangeToken[];

  /** @param tokens The child tokens to compose. */
  public constructor(tokens: readonly IChangeToken[]) {
    this.#tokens = tokens;
  }

  /** True when any child token has changed. */
  public get hasChanged(): boolean {
    return this.#tokens.some((token) => token.hasChanged);
  }

  /** True when any child raises callbacks proactively. */
  public get activeChangeCallbacks(): boolean {
    return this.#tokens.some((token) => token.activeChangeCallbacks);
  }

  /**
   * Registers `callback` against every child token; the returned disposable
   * unregisters from all of them.
   */
  public registerChangeCallback(callback: Func<[state: unknown], void>, state?: unknown): Disposable {
    const registrations = this.#tokens.map((token) => token.registerChangeCallback(callback, state));
    return {
      [Symbol.dispose](): void {
        for (const registration of registrations) {
          registration[Symbol.dispose]();
        }
      },
    };
  }
}
