import { type GetService, type IServiceProvider, ObjectDisposedError, type Registration, type Request } from '@rhombus-std/di.core';
import type { Type } from '@rhombus-std/primitives';
import { ServiceProvider } from '../../ServiceProvider.js';
import { type Caching, disposeScope, disposeScopeAsync, type Owning } from '../lifetime-scope.js';
import { chain } from './symbols.js';

/**
 * One open scope of the tagged lifetime model: the cache and the owned instances for its one tag,
 * the source its provider is minted over, and whether it has ended.
 *
 * @remarks
 * The source refuses once the layer is disposed, appends the layer to the ask's chain, and passes
 * the ask on to the provider the scope was opened from — so a scope opened beneath a disposed one
 * refuses with it, and an ask's chain reads innermost scope first.
 */
export class Layer implements Caching, Owning {
  readonly cache = new Map<Registration<unknown>, Map<Type, unknown>>();
  readonly disposables: unknown[] = [];
  /** What `openScope` wraps for a scope opened from this one, and what a factory resolved here binds to. */
  readonly source: GetService;
  /** The scope itself: disposing it ends the scope. */
  readonly provider: IServiceProvider;
  disposed = false;

  constructor(readonly tag: unknown, parent: GetService) {
    this.source = (request: Request): unknown => {
      if (this.disposed) {
        throw new ObjectDisposedError();
      }
      const crossed = request[chain] as Layer[] | undefined;
      if (crossed === undefined) {
        request[chain] = [this];
      } else {
        crossed.push(this);
      }
      return parent(request);
    };
    const provider = new ServiceProvider(this.source);
    provider.whenDisposed({
      [Symbol.dispose]: () => disposeScope(this),
      [Symbol.asyncDispose]: () => disposeScopeAsync(this),
    });
    this.provider = provider;
  }
}

/** The scopes `request` has crossed, innermost first — none through the built provider. */
export function chainOf(request: Request): readonly Layer[] {
  return (request[chain] as readonly Layer[] | undefined) ?? NONE;
}

const NONE: readonly Layer[] = Object.freeze([]);
