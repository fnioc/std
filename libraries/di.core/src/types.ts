import type { Token } from '@rhombus-std/primitives';
import type { Ctor, Func } from '@rhombus-toolkit/func';

/**
 * Anything a dependency signature can describe: a class constructor (its deps
 * are the ctor parameters) or a factory function (its deps are the call
 * parameters). The `never[]` rest keeps any concrete function assignable here
 * regardless of its own parameter list.
 */
export type DepTarget = Ctor | Func<never[], unknown>;

// `Token` lives in `@rhombus-std/primitives` so the augmentation registry can key
// its bags on it without depending on di.core; re-exported UNCHANGED here, so
// either import names the same type.
export type { Token };

/**
 * Marks a constructor parameter to be injected as a *factory* producing the
 * registered type token, rather than a resolved instance. The factory's own
 * call signature is determined by the caller-supplied `params` list.
 *
 * @remarks
 * `params` is the complete, authored-order list of caller-supplied parameter
 * tokens; when present it pins the factory shape, so it does not drift with
 * registration state.
 */
export interface FactoryRef {
  readonly type: Token;
  readonly params?: readonly Token[];
}

/**
 * A set of alternative dependency slots tried in declaration order (first
 * resolvable member wins). If no member is resolvable, resolution throws.
 * Each member is itself a `DepSlot` — nesting is allowed.
 */
export interface Union {
  readonly union: readonly DepSlot[];
}

/**
 * A SINGULAR (non-union) type that supplies its value directly — no container
 * lookup, and so always satisfiable. Used for a non-union literal param
 * (`"dev"`, `42`, `true`, `1n`) and for a whole-type `void`/`undefined`/`null`,
 * each a type with exactly one inhabitant.
 *
 * @remarks
 * A UNION (`"a" | "b"`, `Foo | undefined`) is NOT a `LiteralRef`: a literal
 * union stays a resolved token, and a nullish union is stripped by the
 * optional/overload path.
 *
 * `value` may legitimately be `undefined` (the `void`/`undefined` case), so a
 * `LiteralRef` is identified by the PRESENCE of the `value` key, never by
 * `value !== undefined`. See `isLiteralRef`.
 */
export interface LiteralRef {
  readonly value: string | number | boolean | bigint | undefined | null;
}

/**
 * Marks a parameter to be injected with the TOKEN STRING of one of the
 * registration's type arguments. `typeArg` is the 1-based hole number
 * (`{ typeArg: 1 }` names the argument bound to `$1`). At close time,
 * substitution replaces the slot with a `LiteralRef` carrying the substituted
 * argument's token string; a raw (unsubstituted) `TypeArgRef` reaching
 * resolution is an error.
 */
export interface TypeArgRef {
  readonly typeArg: number;
}

/**
 * One positional slot in a constructor / factory signature:
 *   - a `Token` string  — a container-resolved dependency (a plain `IResolver`
 *     token resolves to the live provider view — see `RESOLVER_TOKEN`),
 *   - a `FactoryRef`    — a factory-injected parameter (see `FactoryRef`),
 *   - a `Union`         — member-level alternatives tried in order,
 *   - a `LiteralRef`    — a singular literal supplying its value directly, or
 *   - a `TypeArgRef`    — the token string of a type argument (see `TypeArgRef`).
 */
export type DepSlot = Token | FactoryRef | Union | LiteralRef | TypeArgRef;

/**
 * The positional dependency signatures of a constructor / factory: one inner
 * array of `DepSlot`s per overload — `signatures[i][j]` is the slot for
 * parameter `j` of overload `i`.
 *
 * @remarks
 * Required, never optional, on the positional registration forms: "this service
 * takes no dependencies" is STATED as `[[]]` rather than inferred from an absent
 * argument. The bare 2-arg `addClass(token, ctor)` form supplies it later
 * through the gated `withSignature`/`withSignatures` builder.
 */
export type DepSignatures = ReadonlyArray<readonly DepSlot[]>;

/**
 * The result of parsing a closed-generic token `base<arg1,arg2>` into its base
 * and top-level args. A pure data shape; the parse routine producing it lives in
 * `@rhombus-std/di`.
 */
export interface ParsedToken {
  readonly base: Token;
  readonly args: readonly Token[];
}

// The authoring brands (`Inject`, `Hole`, `$`, `Typeof`) live in `./brands.ts`.
