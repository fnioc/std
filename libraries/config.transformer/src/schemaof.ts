// `schemaof<T>()` — the compile-time config-schema mechanism, sibling to
// `tokenfor<T>()` / `keyof<T>()` (type-argument primitives).
//
// Where `tokenfor<IFoo>()` lowers a TYPE argument to a token string, `schemaof<T>()`
// lowers T to the runtime config `Schema` object literal a hand-written
// `.withSchema({...})` would carry: leaf types map to their kind-name strings
// ("string" / "number" / "boolean"), nested records recurse into nested object
// literals, and an optional field wraps as `{ [OPTIONAL]: innerSchema }`. The
// transformer derives it from T's property types at compile time, so callers never
// ship the schema-derivation logic to runtime.
//
// The runtime body exists only so that un-transformed code fails loudly instead of
// silently returning `undefined` — calling `schemaof` without the transformer wired
// up throws a clear error pointing at the missing plugin, exactly like `tokenfor`.
//
// It lives here in `@rhombus-std/config.transformer` (the config authoring package),
// NOT in a runtime leaf, because it is ONLY ever called inside the inline-sugar body
// (`./inline.ts`) — never in runtime source — so it is an authoring-time construct
// that belongs with the domain transformer.

/**
 * Compile-time config schema for a type. Rewritten by the transformer to the
 * `{...}` runtime schema literal; the runtime body only runs when the transformer
 * is absent.
 *
 * @example
 * ```ts
 * // authored inside the withType sugar body:
 * this.withSchema(schemaof<ServerConfig>()); // → withSchema({ host: "string", port: "number" })
 * ```
 */
export function schemaof<T>(): unknown {
  void (null as T | null);
  throw new Error(
    "schemaof<T>() requires @rhombus-std/config.transformer's compile-time transform to run. "
      + 'It has not been applied. Use withSchema({...}) directly, or configure the transformer.',
  );
}

/** The exported identifier name the transformer recognizes as `schemaof`. */
export const SCHEMAOF_NAME = 'schemaof';
