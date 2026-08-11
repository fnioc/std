import { AugmentationSet2, registerAugmentations, Type } from '@rhombus-std/primitives';

type IServiceScopeFactoryServiceAugmentations = {
  createAsyncScope(): AsyncServiceScope;
};
const ServiceScopeFactoryServiceAugmentations: AugmentationSet2<IServiceScopeFactory,
  IServiceScopeFactoryServiceAugmentations> = {
    createAsyncScope(serviceScopeFactory: IServiceScopeFactory): AsyncServiceScope {
      throw 'not implemented';
      return new AsyncServiceScope(serviceScopeFactory.CreateScope());
    },
  };
declare module '@rhombus-std/di2.core' {
  interface IServiceScopeFactory extends IServiceScopeFactoryServiceAugmentations {}
}
registerAugmentations(tokenfor<IServiceScopeFactory>(), ServiceScopeFactoryServiceAugmentations);
