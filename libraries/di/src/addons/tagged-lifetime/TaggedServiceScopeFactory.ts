import type { GetService, IDisposableServiceProvider, ITaggedServiceScopeFactory } from '@rhombus-std/di.core';
import { Layer } from './layer.js';

/**
 * The tagged lifetime model's scope factory: constructed afresh per resolution and bound, once
 * constructed, to the source of the provider the ask came from, so every scope it opens chains
 * onto that provider.
 */
export class TaggedServiceScopeFactory<Lifetime> implements ITaggedServiceScopeFactory<Lifetime> {
  /** What a scope opened here wraps: the innermost scope the ask crossed, or the head beneath the built provider. */
  source: GetService = unbound;

  openScope(lifetime: Exclude<Lifetime, undefined>): IDisposableServiceProvider {
    return new Layer(lifetime, this.source).provider;
  }
}

/** Stands in until the model binds the factory — reached only by a construction the model's hooks never saw. */
function unbound(): never {
  throw new Error('the tagged lifetime model has not bound this scope factory — it was constructed outside an ask the model runs');
}
