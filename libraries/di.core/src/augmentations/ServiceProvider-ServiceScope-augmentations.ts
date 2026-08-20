import { type IServiceProvider, NotImplementedError } from '@rhombus-std/primitives';
import { registerAugmentations, typefor } from '@rhombus-std/primitives.extras';
import { AsyncServiceScope, type IServiceScope, type IServiceScopeFactory } from '../ServiceScope';

declare module '@rhombus-std/primitives' {
  interface IServiceProvider {
    /** The child {@link IServiceScope} `name` creates, through the registered {@link IServiceScopeFactory}. */
    createScope(name?: string): IServiceScope;
    /**
     * @remarks
     * Declared ahead of implementation so callers can compile against it; the lifetime and
     * disposal model this depends on is still undecided.
     * @throws {NotImplementedError} always, until that model is decided.
     */
    createAsyncScope(): AsyncServiceScope;
  }
}

registerAugmentations<IServiceProvider>({
  createScope(this: IServiceProvider, name?: string): IServiceScope {
    return (this.getRequiredService(typefor<IServiceScopeFactory>()) as IServiceScopeFactory)
      .createScope(name);
  },
  createAsyncScope(this: IServiceProvider): AsyncServiceScope {
    throw new NotImplementedError('IServiceProvider.createAsyncScope');
  },
});
