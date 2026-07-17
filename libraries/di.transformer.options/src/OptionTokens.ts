// Deriving the two tokens `addOptions<T>()` lowers to, via di.transformer's own
// token machinery (§15). Nothing options-specific is invented: `token(T)` is the
// plain element token any `resolve<T>()` / `add<T>()` would derive, and
// `token(IOptions<T>)` is the closed-generic form `<Options-base><token(T)>` —
// the identical `base<arg>` composition `deriveToken` performs for a written
// `IOptions<T>`, assembled here for a wrapper the author never spelled out.
//
// The `Options` base (`@rhombus-std/options:IOptions`) is DERIVED, not hard-coded:
// the `Options` interface is located in the program and run through
// `baseTokenForSymbol`, so the base tracks whatever this transformer's own
// derivation would produce for it.

import { baseTokenForSymbol, deriveToken, type TokenContext } from '@rhombus-std/primitives.transformer';
import ts from 'typescript';

/**
 * The canonical base token of `@rhombus-std/options`'s `IOptions<T>`. Used ONLY
 * to RECOGNIZE the right `Options` among any same-named types in the program —
 * the emitted token still comes from {@link baseTokenForSymbol} on the located
 * symbol, never from this constant.
 */
const OPTIONS_BASE = '@rhombus-std/options:IOptions';

/** The pair of tokens the sugar lowers to. */
export interface OptionTokens {
  /** `token(IOptions<T>)` — the token the registration is keyed at. */
  readonly wrapper: string;
  /** `token(T)` — the dependency token whose resolved value is wrapped. */
  readonly element: string;
}

/**
 * Locate `@rhombus-std/options`'s `IOptions<T>` in `program` and return its base
 * token, or `undefined` when it is not in the program. Cached per token context.
 *
 * Candidates are every exported `Options` interface with a type parameter; the
 * one whose derived base equals {@link OPTIONS_BASE} is the package-public
 * `Options`, distinguishing it from any user type of the same name.
 */
export function resolveOptionsBase(
  program: ts.Program,
  ctx: TokenContext,
): string | undefined {
  const cached = baseCache.get(ctx);
  if (cached !== undefined) {
    return cached ?? undefined;
  }

  const base = findOptionsBase(program, ctx);
  baseCache.set(ctx, base ?? null);
  return base;
}

// Per-context cache: `null` records a resolved-but-absent lookup so a program
// without `@rhombus-std/options` is not re-scanned on every call.
const baseCache = new WeakMap<TokenContext, string | null>();

function findOptionsBase(
  program: ts.Program,
  ctx: TokenContext,
): string | undefined {
  const { checker } = ctx;
  for (const sourceFile of program.getSourceFiles()) {
    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
    if (!moduleSymbol) {
      continue;
    }
    for (const exported of checker.getExportsOfModule(moduleSymbol)) {
      if (exported.getName() !== 'IOptions') {
        continue;
      }
      const resolved = exported.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(exported)
        : exported;
      const isGenericInterface = resolved
        .getDeclarations()
        ?.some((decl) => ts.isInterfaceDeclaration(decl) && !!decl.typeParameters?.length);
      if (!isGenericInterface) {
        continue;
      }
      const base = baseTokenForSymbol(resolved, ctx);
      if (base === OPTIONS_BASE) {
        return base;
      }
    }
  }
  return undefined;
}

/**
 * The `{ wrapper, element }` tokens for a `addOptions<T>()` type argument, or
 * `undefined` when `T` has no derivable token (the caller emits a diagnostic and
 * leaves the call in place).
 */
export function optionTokensFor(
  typeArg: ts.TypeNode,
  optionsBase: string,
  ctx: TokenContext,
): OptionTokens | undefined {
  const element = deriveToken(ctx.checker.getTypeFromTypeNode(typeArg), ctx);
  if (element === undefined) {
    return undefined;
  }
  return { wrapper: `${optionsBase}<${element}>`, element };
}
