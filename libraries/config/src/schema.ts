// Runtime-inspectable configuration schemas.
//
// A `Schema` is a hand-writable, runtime value that both DESCRIBES a config
// shape (so build() can coerce against it) and, via `Infer`, PRODUCES the
// static type build() returns. Leaves are kind-name strings ("string" /
// "number" / "boolean"); nesting is a plain object; an optional field is
// wrapped with the `OPTIONAL` symbol.
//
// The optional wrapper is keyed by a UNIQUE SYMBOL, not the property name
// "optional" -- so a real config property literally named "optional" can never
// be mistaken for the wrapper. This is a permanent property of the design, not
// a heuristic that can drift.

/**
 * Out-of-band discriminator for the optional-field wrapper. A `unique symbol`,
 * so a real config key named `"optional"` never collides with it.
 */
export const OPTIONAL: unique symbol = Symbol("@rhombus-std/config.OPTIONAL");
export type OPTIONAL = typeof OPTIONAL;

/** The optional-field wrapper: `{ [OPTIONAL]: innerSchema }`. */
export type OptionalSchema = { readonly [OPTIONAL]: Schema };

/** A nested object schema: string keys mapping to sub-schemas. */
export type ObjectSchema = { readonly [key: string]: Schema };

/**
 * A hand-writable, runtime-inspectable schema. Drives coercion in `build()`.
 * Leaves are kind-name strings; nesting is a plain object; an optional field is
 * wrapped with the {@link OPTIONAL} symbol.
 */
export type Schema = "string" | "number" | "boolean" | OptionalSchema | ObjectSchema;

type OptionalKeys<S> = {
  [K in keyof S]-?: S[K] extends OptionalSchema ? K : never;
}[keyof S];
type RequiredKeys<S> = Exclude<keyof S, OptionalKeys<S>>;

/**
 * The type-level image of a `Schema`: the shape `build()` produces. Leaves map
 * to their scalar type; `{ [OPTIONAL]: S }` maps to `Infer<S> | undefined` and
 * makes the containing key optional (`?`); a plain object recurses.
 *
 * The OPTIONAL branch MUST precede the object branch -- an `OptionalSchema`
 * also structurally satisfies `object`, so branch order is what discriminates
 * it.
 *
 * @example
 * ```ts
 * const schema = {
 *   Host: "string",
 *   Port: "number",
 *   Ssl: { [OPTIONAL]: "boolean" },
 * } as const satisfies Schema;
 * type Config = Infer<typeof schema>;
 * // { readonly Host: string; readonly Port: number; readonly Ssl?: boolean }
 * ```
 */
export type Infer<S> = S extends "string" ? string
  : S extends "number" ? number
  : S extends "boolean" ? boolean
  : S extends { readonly [OPTIONAL]: infer Inner } ? (Inner extends Schema ? Infer<Inner> | undefined : never)
  : S extends object ? (
      & { readonly [K in RequiredKeys<S>]: Infer<S[K]> }
      & { readonly [K in OptionalKeys<S>]?: Infer<S[K]> }
    )
  : never;
