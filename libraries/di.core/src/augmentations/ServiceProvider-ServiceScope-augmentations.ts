import { type Flatten, type IServiceProvider, NotImplementedError } from '@rhombus-std/primitives';
import { registerAugmentations, typefor } from '@rhombus-std/primitives.extras';
import { AsyncServiceScope, type IServiceScope, type IServiceScopeFactory } from '../ServiceScope';

export namespace ServiceProviderServiceScopeAugmentations {
  /** The child {@link IServiceScope} `name` creates, through the registered {@link IServiceScopeFactory}. */
  export function createScope(this: IServiceProvider, name?: string): IServiceScope {
    return (this.getRequiredService(typefor<IServiceScopeFactory>()) as IServiceScopeFactory)
      .createScope(name);
  }

  /**
   * @remarks
   * Declared ahead of implementation so callers can compile against it; the lifetime and
   * disposal model this depends on is still undecided.
   * @throws {NotImplementedError} always, until that model is decided.
   */
  export function createAsyncScope(this: IServiceProvider): AsyncServiceScope {
    throw new NotImplementedError('IServiceProvider.createAsyncScope');
  }
}

declare module '@rhombus-std/primitives' {
  interface IServiceProvider extends Flatten<typeof ServiceProviderServiceScopeAugmentations> {}
}

registerAugmentations<IServiceProvider>(ServiceProviderServiceScopeAugmentations);
