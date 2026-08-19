import { IServiceProvider } from '@rhombus-std/di.core';
import { ConstructorType, FunctionType } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import { Ctor, Func } from '@rhombus-toolkit/func';

declare module '@rhombus-std/di.core' {
  interface IServiceProvider {
  }
}

registerAugmentations<IServiceProvider>({});
