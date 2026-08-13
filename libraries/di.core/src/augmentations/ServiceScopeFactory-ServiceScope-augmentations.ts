import { type AugmentationSet2, NotImplementedError } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import { AsyncServiceScope, type IServiceScopeFactory } from '../ServiceScope';

type IServiceScopeFactoryServiceAugmentations = {
  /**
   * @remarks
   * Declared ahead of implementation so callers can compile against it; the lifetime and
   * disposal model this depends on is still undecided.
   * @throws {NotImplementedError} always, until that model is decided.
   */
  createAsyncScope(): AsyncServiceScope;
};
export const ServiceScopeFactoryServiceAugmentations: AugmentationSet2<IServiceScopeFactory,
  IServiceScopeFactoryServiceAugmentations> = {
    createAsyncScope(): AsyncServiceScope {
      throw new NotImplementedError('IServiceScopeFactory.createAsyncScope');
    },
  };
declare module '@rhombus-std/di.core' {
  interface IServiceScopeFactory extends IServiceScopeFactoryServiceAugmentations {}
}
registerAugmentations<IServiceScopeFactory>(ServiceScopeFactoryServiceAugmentations);
