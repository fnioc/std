/**
 * The control plane's carrier: what a control ask is answered with, holding in {@link service} the
 * thing that was asked for.
 */
export class Control<T> {
  constructor(readonly service: T) {}
}

/**
 * The engine-owned lifetime: a registration carrying this value is answered by the engine itself,
 * bypassing the plan infrastructure entirely. No lifetime model sees one, no vocabulary changes,
 * and nothing caches it.
 *
 * @remarks
 * Not a string — a tagged vocabulary is arbitrary strings, so `'control'` would be a legal scope
 * tag and ambiguous. Not `Symbol.for` — its only advantage is surviving duplicate copies, which
 * the single-instance guard already makes impossible and loud.
 */
export const controlLifetime: unique symbol = Symbol('controlLifetime');
