import type { GetService, IServiceProvider, Request } from '@rhombus-std/di.core';
import { augment, type Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';

export interface ServiceProvider extends IServiceProvider {}

/**
 * The user-facing provider every container is minted with: one held call, forwarded on every ask.
 * Allocates a {@link Request} per call, putting itself on it so the ask resolves back to the
 * provider that opened it.
 */
@augment(typefor<IServiceProvider>())
export class ServiceProvider implements IServiceProvider {
  readonly #getService: GetService;

  constructor(source: GetService) {
    this.#getService = source;
  }

  getService(address: Type): any {
    return this.#getService({ type: address, serviceProvider: this });
  }
}
