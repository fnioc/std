import { type AugmentationSet2, type IServiceProvider, registerAugmentations, Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import { AsyncServiceScope, type IServiceScope, type IServiceScopeFactory } from '../ServiceScope';

type IServiceProviderServiceScopeAugmentations = {
  createScope(): IServiceScope;
  createAsyncScope(): AsyncServiceScope;
};
declare module '@rhombus-std/primitives' {
  interface IServiceProvider extends IServiceProviderServiceScopeAugmentations {}
}
export const ServiceProviderServiceScopeAugmentations: AugmentationSet2<IServiceProvider,
  IServiceProviderServiceScopeAugmentations> = {
    createScope(provider: IServiceProvider): IServiceScope {
      return (provider.getRequiredService(typefor<IServiceScopeFactory>()) as IServiceScopeFactory)
        .createScope();
    },
    createAsyncScope(provider: IServiceProvider): AsyncServiceScope {
      throw new Error('createAsyncScope is not implemented.');
      return new AsyncServiceScope(provider.createScope());
    },
  };

registerAugmentations(typefor<IServiceProvider>(), ServiceProviderServiceScopeAugmentations);
