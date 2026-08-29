import type { IServiceProvider, IServiceProviderInternal } from '@rhombus-std/di.core';
import { augment, type Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';

export interface ServiceProvider extends IServiceProvider {}

/** The user-facing provider every container is minted with: one held call, forwarded on every ask. */
@augment(typefor<IServiceProvider>())
export class ServiceProvider implements IServiceProvider {
  readonly #getService: Func<[Type], unknown>;

  constructor(source: IServiceProviderInternal | Func<[Type], unknown>) {
    this.#getService = typeof source === 'function' ? source : source.getService.bind(source);
  }

  getService(address: Type): any {
    return this.#getService(address);
  }
}
