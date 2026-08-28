import type { IServiceProvider } from '@rhombus-std/di.core';
import { augment, type Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';

export interface ServiceProvider extends IServiceProvider {}

/** The user-facing provider a container whose model keeps nothing is built with: it forwards, and does nothing else. */
@augment(typefor<IServiceProvider>())
export class ServiceProvider implements IServiceProvider {
  readonly #inner: IServiceProvider;

  constructor(inner: IServiceProvider) {
    this.#inner = inner;
  }

  getService(address: Type): any {
    return this.#inner.getService(address);
  }
}
