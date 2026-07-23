// `valueof<T>()` — the compile-time literal-type VALUE mechanism, sibling to
// `keyof<T>()` / `signatureof(...)` (the `.as<"scope">()` lowering, §92).
//
// Where `keyof<Keyed<IFoo, "audit">>()` binds a TYPE argument and lowers to a
// keyed service's KEY string, `valueof<T>()` binds a literal TYPE argument and
// lowers to that type's VALUE literal — `valueof<"scoped">()` → `"scoped"`,
// `valueof<42>()` → `42`. It is the half of the authored lifetime form
// `.as<Scope>()`, whose inline body is `this.as(valueof<Scope>())`: the type-arg
// scope name becomes the runtime value-arg the `as(scope)` verb takes. The
// extraction is the literal-type-to-value logic the Go engine already carries
// (formerly bespoke inside the `.as` lowering); factoring it into `valueof`
// lets `.as` become a plain inline body over this primitive.
//
// The runtime body exists only so that un-transformed code fails loudly instead
// of silently returning `undefined` — calling `valueof` without the transformer
// wired up throws a clear error pointing at the missing plugin, exactly like
// `tokenfor` / `signatureof` / `keyof`. The name is lowercase for family
// consistency; `valueof` is not a reserved word in either type or value
// positions, so a value-position declaration and call compile under strict tsc.
//
// It lives here in `@rhombus-std/di.transformer` (the authoring-time DI package),
// NOT in the `@rhombus-std/primitives` leaf, because it is ONLY ever called
// inside the inline-sugar bodies (`./inline.ts`) — never in runtime source — so
// it is an authoring-time construct that belongs with the domain transformer
// (§92), mirroring `signatureof` and `keyof`.

/**
 * Compile-time literal value of a type. Rewritten by the transformer to the
 * type's value literal (e.g. `"scoped"` for `valueof<"scoped">()`); the runtime
 * body only runs when the transformer is absent.
 *
 * @example
 * ```ts
 * // authored inside the `.as<Scope>()` sugar body:
 * this.as(valueof<Scope>()); // valueof<"scoped">() → this.as("scoped")
 * ```
 */
export function valueof<T>(): T {
  void (0 as unknown as T);
  throw new Error(
    'valueof<T>() requires the @rhombus-std/di.transformer valueof plugin. Add '
      + 'the di.transformer sugar plugin to your tsconfig "plugins", or pass the '
      + 'scope value explicitly to as(scope).',
  );
}

/** The exported identifier name the transformer recognizes as `valueof`. */
export const VALUEOF_NAME = 'valueof';
