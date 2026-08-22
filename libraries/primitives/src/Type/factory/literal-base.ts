/**
 * The global names a literal widens to, so `33` stands where `number` is required and a union
 * naming both drops the literal — each name equal to its own literals' `typeof`. `undefined` and
 * `null` have no base here: nothing subsumes them, which keeps a nullish union member available as
 * an optional dependency's fallback.
 */
export const LITERAL_BASES: ReadonlySet<string> = new Set(['string', 'number', 'bigint', 'boolean']);
