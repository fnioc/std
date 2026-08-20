import { NotImplementedError } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import { AsyncServiceScope, type IServiceScopeFactory } from '../ServiceScope';

declare module '@rhombus-std/di.core' {
  interface IServiceScopeFactory {
    /**
     * @remarks
     * Declared ahead of implementation so callers can compile against it; the lifetime and
     * disposal model this depends on is still undecided.
     * @throws {NotImplementedError} always, until that model is decided.
     */
    createAsyncScope(): AsyncServiceScope;
  }
}
registerAugmentations<IServiceScopeFactory>({
  createAsyncScope(this: IServiceScopeFactory): AsyncServiceScope {
    throw new NotImplementedError('IServiceScopeFactory.createAsyncScope');
  },
});
