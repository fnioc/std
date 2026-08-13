import { type AugmentationSet2, type IServiceProvider, NotImplementedError, Type } from '@rhombus-std/primitives';
import { registerAugmentations, typefor } from '@rhombus-std/primitives.extras';
import { AsyncServiceScope, type IServiceScope, type IServiceScopeFactory } from '../ServiceScope';

type IServiceProviderServiceScopeAugmentations = {
  /** The child {@link IServiceScope} `name` creates, through the registered {@link IServiceScopeFactory}. */
  createScope(name?: string): IServiceScope;

  /**
   * @remarks
   * Declared ahead of implementation so callers can compile against it; the lifetime and
   * disposal model this depends on is still undecided.
   * @throws {NotImplementedError} always, until that model is decided.
   */
  createAsyncScope(): AsyncServiceScope;
};
declare module '@rhombus-std/primitives' {
  interface IServiceProvider extends IServiceProviderServiceScopeAugmentations {}
}
export const ServiceProviderServiceScopeAugmentations: AugmentationSet2<IServiceProvider,
  IServiceProviderServiceScopeAugmentations> = {
    createScope(name?: string): IServiceScope {
      return (this.getRequiredService(typefor<IServiceScopeFactory>()) as IServiceScopeFactory)
        .createScope(name);
    },
    createAsyncScope(): AsyncServiceScope {
      throw new NotImplementedError('IServiceProvider.createAsyncScope');
    },
  };

registerAugmentations<IServiceProvider>(ServiceProviderServiceScopeAugmentations);
