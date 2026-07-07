// Building a `TokenContext` from a `ts.Program`.
//
// Token derivation needs more than a bare `TypeChecker`: package-public
// detection resolves each export entry's on-disk target to the declaration file
// the program loaded (`sourceFileAtStem`), default-lib types tokenize by bare
// name (`isDefaultLib`), and `package.json` discovery reads files
// (`readFile`). This factory wires all of that once per program.
//
// It is shared: the transformer's own `createTransformerFactory` builds its
// context here, and the `@rhombus-std/di.transformer.options` satellite imports
// it so its lowered tokens are byte-identical to the ones this transformer
// derives for the same types — the satellite's `tToken` MUST match the token a
// `services.add<T>(…)` registration lowered to, or the dependency never resolves.

import type { Func } from "@rhombus-toolkit/func";
import ts from "typescript";
import { stripExt, type TokenContext } from "./tokens.js";

/** Options for {@link createTokenContext}. */
export interface TokenContextOptions {
  /**
   * Reads a file's text for `package.json` discovery. Defaults to
   * `ts.sys.readFile`; the in-memory test harness injects a reader that sees its
   * virtual filesystem.
   */
  readonly readFile?: Func<[string], string | undefined>;
}

/**
 * Build the {@link TokenContext} for `program`: the checker, the project root,
 * a stem index for package-public detection, and the default-lib predicate.
 */
export function createTokenContext(
  program: ts.Program,
  options: TokenContextOptions = {},
): TokenContext {
  const checker = program.getTypeChecker();
  const projectRoot = computeProjectRoot(program);

  // Index every program source file by its extension-stripped path ("stem") so
  // package-public detection can turn an export entry's on-disk target (a `.js`
  // path) into the declaration file the program loaded (`.d.ts`). Declaration
  // files outrank `.js` at the same stem — that's the module we read exports of.
  const byStem = new Map<string, ts.SourceFile>();
  const stemRank = (name: string): number => name.endsWith(".d.ts") ? 3 : /\.[mc]?tsx?$/.test(name) ? 2 : 1;
  for (const sf of program.getSourceFiles()) {
    const stem = stripExt(sf.fileName.replace(/\\/g, "/"));
    const existing = byStem.get(stem);
    if (!existing || stemRank(sf.fileName) >= stemRank(existing.fileName)) {
      byStem.set(stem, sf);
    }
  }

  return {
    checker,
    projectRoot,
    readFile: options.readFile,
    sourceFileAtStem: (stem) => byStem.get(stem),
    // Default-lib types (`Promise`, `Map`) tokenize by bare name — their lib
    // path is machine-dependent and carries no identity.
    isDefaultLib: (file) => program.isSourceFileDefaultLibrary(file),
  };
}

/** Best-effort project root: the program's common source directory. */
function computeProjectRoot(program: ts.Program): string {
  const opts = program.getCompilerOptions();
  if (opts.rootDir) {
    return opts.rootDir.replace(/\\/g, "/");
  }
  // `getCommonSourceDirectory` exists at runtime but is not in the public
  // typings; fall back to the current directory when unavailable.
  const withCommon = program as ts.Program & {
    getCommonSourceDirectory?: Func<[], string>;
  };
  const common = withCommon.getCommonSourceDirectory?.();
  return (common || program.getCurrentDirectory()).replace(/\\/g, "/");
}
