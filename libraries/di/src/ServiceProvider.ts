import type { IServiceProvider } from '@rhombus-std/di.core';
import { augment, type Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';

export interface ServiceProvider extends IServiceProvider {}

/** The user-facing provider: an empty, augmented door answering every request through one handler, bound as the provider is constructed. */
@augment(typefor<IServiceProvider>())
export class ServiceProvider implements IServiceProvider {
  readonly #handler: Func<[Type], unknown>;

  constructor(bind: Func<[IServiceProvider], Func<[Type], unknown>>) {
    this.#handler = bind(this);
  }

  getService(address: Type): any {
    if (!address) {
      throw new TypeError('getService was handed a nullish service type.');
    }
    return this.#handler(address);
  }
}
