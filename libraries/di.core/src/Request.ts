import type { Type } from '@rhombus-std/primitives';

import type { Handle } from './hooks.js';
import type { IServiceProvider } from './IServiceProvider.js';

/**
 * What flows through the middleware chain for one ask: the address being resolved, and whatever a
 * middleware attaches on the way down under a symbol it exports.
 *
 * @remarks
 * The two inheritors are the ask's arms — {@link ServiceRequest} for an ask a provider opened,
 * {@link ControlRequest} for one a middleware makes at fold time — told apart by `instanceof`.
 * A slot naming an arm is answered with the ask in flight only when the ask IS that arm; a slot
 * naming this base class is answered with either.
 *
 * The index signature declares the attachment mechanism without naming any contents, so a core
 * type carries no lifetime vocabulary while an addon still attaches what it needs under a symbol
 * it exports. A string key would be reachable by anyone who types the same string with nothing
 * recording that they did; an imported symbol is reachable only through an import a reviewer can
 * see. Attachment happens on the way DOWN, before `next` — the object is shared with every layer
 * beneath and with the engine, so a write on the unwind is invisible to everything it was meant for.
 */
export abstract class Request {
  /** The staged-hook handles this ask activated, in activation order. */
  private readonly active: Handle[] = [];

  [key: symbol]: unknown;

  constructor(readonly address: Type) {}

  /**
   * Records `handle` as active for this ask and answers the same request — a middleware layer
   * writes `next(request.activate(handle))`.
   */
  activate(handle: Handle): this {
    this.active.push(handle);
    return this;
  }
}

/** An ask a provider opened, carrying the provider so the ask resolves back to it. */
export class ServiceRequest extends Request {
  constructor(address: Type, readonly serviceProvider: IServiceProvider) {
    super(address);
  }
}

/** An ask a middleware makes at fold time, before any provider exists. */
export class ControlRequest extends Request {}
