import { type GetService, type IServiceProvider, type IServiceScopeFactory, ObjectDisposedError, Registration } from '@rhombus-std/di.core';
import { ServiceProvider } from '../../ServiceProvider.js';
import { disposeScope, disposeScopeAsync } from '../lifetime-scope.js';
import { createMarkerMiddleware } from './marker.js';
import type { Scope, ScopeTable } from './ScopeTable.js';

/**
 * What the model holds behind one build: the scopes open under it, the singleton scope among
 * them, and the slot its one lifetime middleware fills at fold time.
 */
export interface ModelState {
  lifetime: GetService | undefined;
  readonly scopes: ScopeTable;
  readonly singletons: Scope;
}

/**
 * The model's scope factory, filed as a value so it is the one instance everywhere and is never
 * captured for disposal.
 *
 * @remarks
 * It reads the lifetime middleware out of the model's state rather than holding a provider, so the
 * scopes it opens are flat: each stands directly under the build, whichever provider the factory
 * was resolved from. The slot is never read empty — the factory is reachable only through a built
 * provider, and folding the chain is what fills it.
 */
export class ScopeFactory implements IServiceScopeFactory {
  readonly #state: ModelState;

  constructor(state: ModelState) {
    this.#state = state;
  }

  /** The id every ask entering outside an opened scope is stamped with. */
  get singletonScopeId(): symbol {
    return this.#state.singletons.id;
  }

  openScope(): IServiceProvider {
    const { lifetime, scopes, singletons } = this.#state;
    if (singletons.disposed) {
      throw new ObjectDisposedError();
    }
    const scope = scopes.open();
    const provider = new ServiceProvider(createMarkerMiddleware(scope.id)(lifetime!));
    scope.provider = provider;
    provider.whenDisposed({
      [Symbol.dispose]: () => {
        scopes.close(scope);
        disposeScope(scope);
      },
      [Symbol.asyncDispose]: async () => {
        scopes.close(scope);
        await disposeScopeAsync(scope);
      },
    });
    return provider;
  }
}

/** The singleton scope's id of the model filed in `registry`, read off the scope factory it registered. */
export function findSingletonScopeId(registry: Iterable<Registration<unknown>>): symbol | undefined {
  return Iterator.from(registry)
    .filter(Registration.isValueRegistration)
    .map(registration => registration.value)
    .find(value => value instanceof ScopeFactory)
    ?.singletonScopeId;
}
