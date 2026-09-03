/**
 * The scopes an ask has crossed, innermost first — each scope's middleware appends its layer here
 * on the way down, so a hook finds the layer in charge of a node's tag by the first match.
 */
export const chain: unique symbol = Symbol('chain');
