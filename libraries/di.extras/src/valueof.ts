// `valueof<T>()` binds a literal type argument and, at build time, becomes that type's value —
// `valueof<"scoped">()` → `"scoped"`, `valueof<42>()` → `42`. It is how a sugar body turns a
// literal carried as a type argument into the value argument the underlying member takes.

/**
 * The value a literal type denotes.
 *
 * @example
 * ```ts
 * withLifetime(valueof<Scope>()); // valueof<"scoped">() → withLifetime("scoped")
 * ```
 */
export function valueof<T>(): T {
  void (0 as unknown as T);
  throw new Error(
    'valueof<T>() requires the @rhombus-std/di.extras authoring transform. Depend on '
      + '@rhombus-std/di.extras so ttsc spawns the @rhombus-std transform host, or pass '
      + 'the value explicitly instead of naming it as a type argument.',
  );
}

export const VALUEOF_NAME = 'valueof';
