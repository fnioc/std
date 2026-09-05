import type { IServiceProvider } from './IServiceProvider.js';

/**
 * The provider of a scope, whose disposal ends that scope.
 *
 * @remarks
 * Disposable in both forms — `using` and `await using` alike. Disposing releases whatever its
 * subscribers hold for that particular provider, is idempotent, and costs nothing where nobody
 * subscribed. Disposal flows from the holder into the provider, never through
 * {@link IServiceProvider.getService}.
 */
export interface IDisposableServiceProvider extends IServiceProvider, Disposable, AsyncDisposable {}
