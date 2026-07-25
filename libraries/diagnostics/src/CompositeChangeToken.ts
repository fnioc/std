// A minimal composite over several IChangeTokens, kept internal to this package.
//
// An assembled reactive `IOptions<MetricsOptions>` / `IOptions<TracingOptions>` may
// watch multiple change-token sources (e.g. two addConfig calls binding two
// sections). `Options.watch` takes one producer, so the sources' tokens compose
// into one token that has changed when any child has.
//
// Duplicates @rhombus-std/options.augmentations's own CompositeChangeToken; the
// intended follow-up is to promote one copy into @rhombus-std/primitives and
// delete both, but that's out of scope here — this local copy avoids a
// cross-package internal reach in the meantime.

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
    return { [Symbol.dispose](): void {
      for (const registration of registrations) {
        registration[Symbol.dispose]();
      }
    } };
  }
}
