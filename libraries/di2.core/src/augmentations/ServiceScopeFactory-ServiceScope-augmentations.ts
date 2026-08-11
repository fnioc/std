import { type AugmentationSet2, registerAugmentations } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import { AsyncServiceScope, type IServiceScopeFactory } from '../ServiceScope';

type IServiceScopeFactoryServiceAugmentations = {
  createAsyncScope(): AsyncServiceScope;
};
export const ServiceScopeFactoryServiceAugmentations: AugmentationSet2<IServiceScopeFactory,
  IServiceScopeFactoryServiceAugmentations> = {
    createAsyncScope(serviceScopeFactory: IServiceScopeFactory): AsyncServiceScope {
      throw new Error('createAsyncScope is not implemented.');
      return new AsyncServiceScope(serviceScopeFactory.createScope());
    },
  };
declare module '@rhombus-std/di2.core' {
  interface IServiceScopeFactory extends IServiceScopeFactoryServiceAugmentations {}
}
registerAugmentations(typefor<IServiceScopeFactory>(), ServiceScopeFactoryServiceAugmentations);
