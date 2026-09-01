import type { Type } from '@rhombus-std/primitives';

import type { IServiceProvider } from './IServiceProvider.js';

/**
 * What flows through the middleware chain for one ask: the address being resolved, the provider
 * that opened it, and whatever a middleware attaches on the way down under a symbol it exports.
 *
 * @remarks
 * The index signature declares the attachment mechanism without naming any contents, so a core
 * type carries no lifetime vocabulary while an addon still attaches what it needs under a symbol
 * it exports. A string key would be reachable by anyone who types the same string with nothing
 * recording that they did; an imported symbol is reachable only through an import a reviewer can
 * see. Attachment happens on the way DOWN, before `next` — the object is shared with every layer
 * beneath and with the engine, so a write on the unwind is invisible to everything it was meant for.
 */
export interface Request {
  readonly type: Type;
  readonly serviceProvider: IServiceProvider;
  [key: symbol]: unknown;
}
