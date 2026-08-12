import { type AugmentationSet2, type IServiceProvider, NotImplementedError, Type } from '@rhombus-std/primitives';
import { registerAugmentations, typefor } from '@rhombus-std/primitives.extras';
import { AsyncServiceScope, type IServiceScope, type IServiceScopeFactory } from '../ServiceScope';

type IServiceProviderServiceScopeAugmentations = {
  createScope(name?: string): IServiceScope;
  createAsyncScope(): AsyncServiceScope;
};
declare module '@rhombus-std/primitives' {
  interface IServiceProvider extends IServiceProviderServiceScopeAugmentations {}
}
export const ServiceProviderServiceScopeAugmentations: AugmentationSet2<IServiceProvider,
  IServiceProviderServiceScopeAugmentations> = {
    createScope(provider: IServiceProvider, name?: string): IServiceScope {
      return (provider.getRequiredService(typefor<IServiceScopeFactory>()) as IServiceScopeFactory)
        .createScope(name);
    },
    createAsyncScope(provider: IServiceProvider): AsyncServiceScope {
      throw new NotImplementedError('IServiceProvider.createAsyncScope');
      return new AsyncServiceScope(provider.createScope());
    },
  };

registerAugmentations<IServiceProvider>(ServiceProviderServiceScopeAugmentations);
