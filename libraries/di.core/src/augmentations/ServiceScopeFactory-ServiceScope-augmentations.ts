import { NotImplementedError } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { Flatten } from '@rhombus-toolkit/type-helpers';
import { AsyncServiceScope, type IServiceScopeFactory } from '../ServiceScope';

export namespace ServiceScopeFactoryServiceAugmentations {
  /**
   * @remarks
   * Declared ahead of implementation so callers can compile against it; the lifetime and
   * disposal model this depends on is still undecided.
   * @throws {NotImplementedError} always, until that model is decided.
   */
  export function createAsyncScope(this: IServiceScopeFactory): AsyncServiceScope {
    throw new NotImplementedError('IServiceScopeFactory.createAsyncScope');
  }
}

declare module '@rhombus-std/di.core' {
  interface IServiceScopeFactory extends Flatten<typeof ServiceScopeFactoryServiceAugmentations> {}
}
registerAugmentations<IServiceScopeFactory>(ServiceScopeFactoryServiceAugmentations);
