import { Type } from '@rhombus-std/primitives';
import type { IServiceProvider } from './IServiceProvider.js';

/**
 * The well-known address for opening scopes: the installed lifetime model supplies the
 * implementation, and the returned provider resolves inside the scope it opened.
 *
 * @typeParam Args - how a scope is named as it opens, in whatever vocabulary the model defines
 * for naming one. A model whose scopes need no name takes none, and a model that names them the
 * same way registrations do says so by composing that spelling in here.
 */
export interface ScopeFactory<Args extends readonly any[] = []> {
  (...args: Args): IServiceProvider;
}

export namespace ScopeFactory {
  /** The address a model registers its creation verb under, and the one a provider looks for. */
  export const address = Type.imported('ScopeFactory', '@rhombus-std/di.core', [Type.global('unknown')]);
}
