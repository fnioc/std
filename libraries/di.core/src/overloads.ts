// Overload-faithful analogs of the builtin `Parameters<T>` /
// `ConstructorParameters<T>` — split out of the former bundled `types.ts` (see
// docs/decisions.md #46); port-original (no reference-source file to mirror),
// grouped here as their own concern since they're a self-contained recursion
// unrelated to the slot/token ABI or the authoring brands.
//
// The builtin `Parameters<T>` / `ConstructorParameters<T>` see only the LAST
// overload of an overloaded function / constructor — every earlier signature is
// invisible. The utilities below recover the FULL set as a union of parameter
// tuples, which is how an overloaded ctor's shape survives into a factory: typing
// a factory rest parameter `(...args: OverloadedConstructorParameters<typeof C>)`
// makes the transformer emit one dep signature per constructor overload.

/**
 * ONE overload's own non-call properties, carried across the peeling recursion so
 * a callable-with-statics keeps them. `Pick<T, keyof T>` is `{}` for a bare
 * function type and the static side for a constructor type.
 */
type OverloadProps<T> = Pick<T, keyof T>;

/**
 * Peel an intersection of call signatures (an overloaded function type) into a
 * UNION of its individual signatures. The technique (Vojtěch Mašek / type-fest):
 * `infer` matches the LAST signature and emits it, then recurses with the
 * accumulator intersected back in so the next match resolves to the PRECEDING
 * overload. Bounded — each step strips one signature, terminating once the
 * accumulator already subsumes the whole overload set (`TAccumulator extends
 * TOverload`).
 */
type OverloadUnionRecursive<TOverload, TAccumulator = unknown> = TOverload extends
  (...args: infer TArgs) => infer TReturn ? TAccumulator extends TOverload ? never
  :
    | OverloadUnionRecursive<
      TAccumulator & TOverload,
      TAccumulator & ((...args: TArgs) => TReturn) & OverloadProps<TOverload>
    >
    | ((...args: TArgs) => TReturn)
  : never;

/**
 * The UNION of a function type's individual call-signature overloads. Seeds the
 * recursion with a `() => never` overload hoisted to the FRONT of the
 * intersection (required for the bounded recursion to fire), then excludes that
 * sentinel from the result unless `T` genuinely is `() => never`.
 */
type OverloadUnion<T extends (...args: any[]) => any> = Exclude<
  OverloadUnionRecursive<(() => never) & T>,
  T extends () => never ? never : () => never
>;

/**
 * Every overload's parameter tuple for a function type `T`, as a union — the
 * overload-faithful analog of the builtin `Parameters<T>`. For a `T` with
 * signatures `(a: A)` and `(a: B, b: C)` this is `[a: A] | [a: B, b: C]`; a
 * single-overload function yields its one tuple.
 */
export type OverloadedParameters<T extends (...args: any[]) => any> = Parameters<
  OverloadUnion<T>
>;

/** The construct-signature counterpart of {@link OverloadProps} — the static side. */
type ConstructorOverloadProps<T> = Pick<T, keyof T>;

/**
 * The construct-signature counterpart of {@link OverloadUnionRecursive}: peels an
 * intersection of CONSTRUCT signatures (an overloaded constructor type) into a
 * union of its individual signatures. A concrete `new` is used, NOT `abstract
 * new`: intersecting an abstract construct signature with a concrete class's
 * `new` signatures derails overload inference (it collapses to `any`), and the
 * sole consumer — a factory that does `new C(...args)` — needs a concrete
 * constructor anyway.
 */
type ConstructorOverloadUnionRecursive<TOverload, TAccumulator = unknown> = TOverload extends
  new(...args: infer TArgs) => infer TReturn ? TAccumulator extends TOverload ? never
  :
    | ConstructorOverloadUnionRecursive<
      TAccumulator & TOverload,
      TAccumulator & (new(...args: TArgs) => TReturn) & ConstructorOverloadProps<TOverload>
    >
    | (new(...args: TArgs) => TReturn)
  : never;

/** The construct-signature counterpart of {@link OverloadUnion}. */
type ConstructorOverloadUnion<T extends new(...args: any[]) => any> = Exclude<
  ConstructorOverloadUnionRecursive<(new() => never) & T>,
  T extends new() => never ? never : new() => never
>;

/**
 * Every construct-overload's parameter tuple for a constructor type `T`, as a
 * union — the overload-faithful analog of the builtin `ConstructorParameters<T>`.
 * For a `C` with constructors `(a: A)` and `(a: B, b: C)`,
 * `OverloadedConstructorParameters<typeof C>` is `[a: A] | [a: B, b: C]`; a
 * single-overload ctor yields its one tuple and a zero-arg ctor yields `[]`.
 * Constrained to a concrete (`new`-able) constructor — an abstract class has no
 * constructible instance, and the factory that consumes this must `new` its
 * argument.
 */
export type OverloadedConstructorParameters<
  T extends new(...args: any[]) => any,
> = ConstructorParameters<ConstructorOverloadUnion<T>>;
