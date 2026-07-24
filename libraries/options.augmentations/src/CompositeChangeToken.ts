import type { IChangeToken } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';

/**
 * An {@link IChangeToken} over a set of child tokens: it {@link hasChanged}
 * when any child has, and a callback registered against it fires when any child
 * fires. Disposing the registration unregisters from every child.
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
