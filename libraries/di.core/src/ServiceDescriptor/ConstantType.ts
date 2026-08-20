/**
 * The positional value-door marker: a marker carrying only its kind.
 *
 * @remarks
 * In the positional registration overload — `add(serviceType, v, ConstantType)` — no member name
 * can state which door the implementer came in by, and a callable registered AS a value is
 * indistinguishable from a factory by its own type, so the call site passes this marker where the
 * other doors pass the implementer's derived type. It is consumed at the verb and stored nowhere:
 * a value descriptor names its door by its `value` member.
 */
export interface ConstantType {
  readonly kind: 'constant';
}

export const ConstantType: ConstantType = Object.freeze({ kind: 'constant' });
