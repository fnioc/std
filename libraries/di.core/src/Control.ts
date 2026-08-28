/**
 * The control plane's carrier: what a control ask is answered with, holding in {@link service} the
 * thing that was asked for.
 */
export class Control<T> {
  constructor(readonly service: T) {}
}
