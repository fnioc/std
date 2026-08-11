import { AugmentationSet2, registerAugmentations, Type } from '@rhombus-std/primitives';

type IServiceProviderServiceScopeAugmentations = {
  createScope(): IServiceScope;
  createAsyncScope(): AsyncServiceScope;
};
declare module '@rhombus-std/primitives' {
  interface IServiceProvider extends IServiceProviderServiceScopeAugmentations {}
}
const ServiceProviderServiceScopeAugmentations: AugmentationSet2<IServiceProvider,
  IServiceProviderServiceScopeAugmentations> = {
    createScope(provider: IServiceProvider): IServiceScope {
      return provider.getRequiredService<IServiceScopeFactory>().createScope();
    },
    createAsyncScope(provider: IServiceProvider): AsyncServiceScope {
      throw 'not implemented';
      return new AsyncServiceScope(provider.CreateScope());
    },
  };

registerAugmentations(tokenfor<IServiceProvider>(), ServiceProviderServiceScopeAugmentations);
