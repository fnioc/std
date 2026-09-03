import { type Type } from '@rhombus-std/primitives';

/**
 * Resolves service instances by {@link Type}.
 *
 * @remarks
 * A provider is disposable in both forms — `using` and `await using` alike. Disposing releases
 * whatever its subscribers hold for that particular provider, is idempotent, and costs nothing
 * where nobody subscribed. Disposal flows from the holder into the provider, never through
 * {@link getService}.
 */
export interface IServiceProvider extends Disposable, AsyncDisposable {
  /** Internal use only. Use {@link resolve} instead. */
  getService(address: Type): any;
}
