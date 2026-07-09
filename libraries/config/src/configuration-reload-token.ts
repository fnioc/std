// ConfigurationReloadToken -- ported from MECA's ConfigurationReloadToken.
//
// A single-fire IChangeToken: hasChanged flips permanently once onReload()
// runs, and every callback registered via registerChangeCallback fires. The
// owner (a provider or the root) does NOT reset a fired instance -- it swaps
// in a brand-new ConfigurationReloadToken after each fire (see
// ConfigurationProvider.onReload / ConfigurationRoot's own reload plumbing),
// so a fired token stays fired forever and each registerChangeCallback
// subscriber observes exactly one transition per instance.
//
// Backed by this monorepo's AbortSignal-based CancellationChangeToken over a
// private AbortController -- the structural analog of the reference's
// AbortController-backed implementation.

import type { IChangeToken } from "@rhombus-std/primitives";
import { CancellationChangeToken } from "@rhombus-std/primitives";

export class ConfigurationReloadToken implements IChangeToken {
  readonly #controller = new AbortController();
  readonly #token: CancellationChangeToken;

  public constructor() {
    this.#token = new CancellationChangeToken(this.#controller.signal);
  }

  public get hasChanged(): boolean {
    return this.#token.hasChanged;
  }

  public get activeChangeCallbacks(): boolean {
    return this.#token.activeChangeCallbacks;
  }

  public registerChangeCallback(callback: (state: unknown) => void, state?: unknown): Disposable {
    return this.#token.registerChangeCallback(callback, state);
  }

  /** Fires this token: {@link hasChanged} flips to `true` and every registered callback runs. */
  public onReload(): void {
    this.#controller.abort();
  }
}
