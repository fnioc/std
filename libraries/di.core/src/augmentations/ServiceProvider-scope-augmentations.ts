import { registerAugmentations } from '@rhombus-std/primitives.extras';

import { ScopeFactoryUnavailableError } from '../Errors.js';
import type { IServiceProvider } from '../IServiceProvider.js';
import type { LifetimeArgument } from '../LifetimeModel';
import { ScopeFactory } from '../ScopeFactory.js';

declare module '@rhombus-std/di.core' {
  interface IServiceProvider<Lifetime> {
    /**
     * Opens a child provider through the installed lifetime model's standard {@link ScopeFactory}.
     * @throws {ScopeFactoryUnavailableError} when the installed model does not publish one.
     */
    createScope(...lifetime: LifetimeArgument<Lifetime>): IServiceProvider<Lifetime>;
  }
}

registerAugmentations<IServiceProvider>({
  createScope(this: IServiceProvider, lifetime?: unknown): IServiceProvider {
    const factory = this.getService(ScopeFactory.address) as ScopeFactory<unknown> | undefined;
    if (factory === undefined) {
      throw new ScopeFactoryUnavailableError();
    }
    return factory(lifetime);
  },
});
