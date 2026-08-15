/**
 * The global type a literal widens to, so `33` stands where `number` is required and a union
 * naming both drops the literal.
 */
export const LITERAL_BASE: Readonly<Record<string, string>> = {
  string: 'string',
  number: 'number',
  bigint: 'bigint',
  boolean: 'boolean',
};
