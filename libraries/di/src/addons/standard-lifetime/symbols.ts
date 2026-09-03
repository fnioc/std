/**
 * The lifetime kind of the provider an ask entered through — `'singleton'` on the container's own
 * provider, `'scoped'` on an opened scope's. Stamped on every request by the model's marker.
 */
export const lifetimeKind: unique symbol = Symbol('lifetimeKind');

/** The id of the scope an ask entered through; absent on an ask through the container's own provider. */
export const scopeId: unique symbol = Symbol('scopeId');
