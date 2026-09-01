import type { IServiceProvider, Request } from '@rhombus-std/di.core';
import { augment, type Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';

export interface ServiceProvider extends IServiceProvider {}

/**
 * The user-facing provider every container is minted with: one held call, forwarded on every ask.
 * Allocates a {@link Request} per call, putting itself on it so the ask resolves back to the
 * provider that opened it.
 */
@augment(typefor<IServiceProvider>())
export class ServiceProvider implements IServiceProvider {
  readonly #getService: Func<[Request], unknown>;

  constructor(source: Func<[Request], unknown>) {
    this.#getService = source;
  }

  getService(address: Type): any {
    return this.#getService({ type: address, serviceProvider: this });
  }
}
