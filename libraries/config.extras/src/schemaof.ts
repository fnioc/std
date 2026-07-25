/**
 * Compile-time config schema for `T`: leaf types resolve to `"string"` /
 * `"number"` / `"boolean"`, nested records to nested object literals, and an
 * optional field wraps as `{ [OPTIONAL]: innerSchema }`.
 *
 * @example
 * ```ts
 * schemaof<ServerConfig>(); // → { host: "string", port: "number" }
 * ```
 */
export function schemaof<T>(): unknown {
  void (null as T | null);
  throw new Error(
    "schemaof<T>() requires @rhombus-std/config.extras's compile-time transform to run. "
      + 'It has not been applied. Use withSchema({...}) directly, or configure the transformer.',
  );
}

/** The exported identifier name recognized as `schemaof`. */
export const SCHEMAOF_NAME = 'schemaof';
