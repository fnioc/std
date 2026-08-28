import type { IServiceProvider, Middleware } from '@rhombus-std/di.core';
import { assertTruthy, type Type } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';

export interface MiddlewareServiceProvider extends IServiceProvider {}

/**
 * Composes middleware around an inner provider.
 *
 * @remarks
 * The chain is built here, once, over a terminus forwarding to `inner` — so every factory runs
 * exactly once, and one resolving through its own `next` while composing resolves at that moment.
 */
export class MiddlewareServiceProvider implements IServiceProvider {
  readonly #chain: Func<[request: Type], unknown>;

  constructor(inner: IServiceProvider, middlewares: readonly Middleware[]) {
    this.#chain = middlewares.reduceRight<Func<[request: Type], unknown>>(
      (next, middleware) => middleware(next),
      request => inner.getService(request),
    );
  }

  getService(address: Type): any {
    assertTruthy(address, 'the service type handed to MiddlewareServiceProvider.getService');
    return this.#chain(address);
  }
}
