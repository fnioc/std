/**
 * The implementer type of a value registration: a marker carrying only its kind.
 *
 * @remarks
 * A value registration has no signature to read, no injection list, and nothing to call, so its
 * implementer slot carries no shape — only the kind saying the implementer is handed back as it
 * stands. The call site is what knows a callable is meant as a value rather than a factory (the
 * callable's own type cannot say), so the value door passes this marker where the other doors
 * pass the implementer's derived type.
 */
export interface ConstantType {
  readonly kind: 'constant';
}

export const ConstantType: ConstantType = Object.freeze({ kind: 'constant' });
