// `valueof<T>()` binds a literal type argument and, at build time, becomes that type's value —
// `valueof<"scoped">()` → `"scoped"`, `valueof<42>()` → `42`. It backs the `.as<Scope>()` lifetime
// form, whose body is `this.as(valueof<Scope>())`: the type-arg scope name becomes the value-arg
// `as(scope)` takes.

/**
 * The value a literal type denotes.
 *
 * @example
 * ```ts
 * this.as(valueof<Scope>()); // valueof<"scoped">() → this.as("scoped")
 * ```
 */
export function valueof<T>(): T {
  void (0 as unknown as T);
  throw new Error(
    'valueof<T>() requires the @rhombus-std/di.extras authoring transform. Depend on '
      + '@rhombus-std/di.extras so ttsc spawns the @rhombus-std transform host, or pass '
      + 'the scope value explicitly to as(scope).',
  );
}

export const VALUEOF_NAME = 'valueof';
