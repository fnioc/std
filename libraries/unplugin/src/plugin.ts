// The unified bundler plugin: ONE `createUnplugin`, ONE `transform` hook,
// composing the @rhombus-std transformers over a shared {@link ProgramService}.
//
// Why one hook and not four chained unplugins: each unplugin `transform` hook
// prints its result and the next reparses it, detaching the file from the shared
// Program's SourceFile (and its TypeChecker). The transformers are hard
// type-aware, so that detachment breaks them. Composing every active
// before-factory into a SINGLE `ts.transform` pass mirrors exactly how `tspc`
// chains the same plugins today.
//
// Diagnostics: the diagnostic-emitting transformers (`di`, `di-options`,
// `config`) raise `ts.Diagnostic`s through the shared sink. Error-severity ones
// abort the build via `this.error` (present on every adapter context — Bun,
// Rollup, esbuild, webpack — records/throws them; we fall back to `throw` only
// if some adapter omits it); warnings go to `this.warn` (or `console.warn`).
//
// Sourcemaps: v1 returns `{ code }` only — no map. Bun (and every other adapter)
// then maps against the transformed source. A known limitation; map synthesis is
// deferred.

import ts from "typescript";
import { createUnplugin, type UnpluginFactory, type UnpluginInstance } from "unplugin";
import { createProgramService, type ProgramService } from "./program-service.js";
import { DEFAULT_TRANSFORMS, type TransformName } from "./registry.js";

/** User-facing options for the @rhombus-std unplugin host. */
export interface UnpluginStdOptions {
  /**
   * Path to the consumer's `tsconfig.json`. Defaults to `./tsconfig.json` in the
   * current working directory. The plugin's shared Program is built from THIS
   * config, so its `customConditions` (`["built"]`) and `types` array (the
   * declare-module augmentations) are inherited — never hand-assembled.
   */
  readonly tsconfig?: string;
  /**
   * Which transformers to run, in order. Defaults to every transformer:
   * `["di", "di-options", "config", "nameof"]`.
   */
  readonly transforms?: readonly TransformName[];
}

const PLUGIN_NAME = "@rhombus-std/unplugin";

const FORMAT_HOST: ts.FormatDiagnosticsHost = {
  getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
  getCanonicalFileName: (fileName) => fileName,
  getNewLine: () => "\n",
};

/** `.ts`/`.tsx`/`.mts`/`.cts` first-party source only — never `.d.ts` or deps. */
function shouldTransform(id: string): boolean {
  const withoutQuery = id.replace(/[?#].*$/, "");
  if (!/\.[cm]?tsx?$/.test(withoutQuery)) {
    return false;
  }
  if (/\.d\.[cm]?ts$/.test(withoutQuery)) {
    return false;
  }
  // Dependency source is already authored/lowered; the shared Program is built
  // from the consumer's own tsconfig and should never pull node_modules in.
  if (withoutQuery.includes("/node_modules/")) {
    return false;
  }
  return true;
}

/**
 * The unplugin factory. Lazily builds ONE {@link ProgramService} on first
 * transform (so config parsing is deferred until the build actually runs) and
 * reuses it for every file.
 */
export const unpluginFactory: UnpluginFactory<UnpluginStdOptions | undefined> = (rawOptions) => {
  const options = rawOptions ?? {};
  const transforms = options.transforms ?? DEFAULT_TRANSFORMS;
  const tsconfigPath = options.tsconfig ?? `${ts.sys.getCurrentDirectory()}/tsconfig.json`;

  let service: ProgramService | undefined;
  function getService(): ProgramService {
    if (!service) {
      service = createProgramService({ tsconfigPath });
    }
    return service;
  }

  return {
    name: PLUGIN_NAME,
    transformInclude(id) {
      return shouldTransform(id);
    },
    transform(code, id) {
      const { text, diagnostics } = getService().transformFile(id, code, transforms);

      const errors: ts.Diagnostic[] = [];
      for (const diagnostic of diagnostics) {
        if (diagnostic.category === ts.DiagnosticCategory.Error) {
          errors.push(diagnostic);
          continue;
        }
        const message = ts.formatDiagnostic(diagnostic, FORMAT_HOST);
        if (typeof this.warn === "function") {
          this.warn(message);
        } else {
          console.warn(message);
        }
      }

      if (errors.length) {
        const message = ts.formatDiagnostics(errors, FORMAT_HOST);
        if (typeof this.error === "function") {
          this.error(message);
        } else {
          throw new Error(message);
        }
      }

      return { code: text };
    },
  };
};

/**
 * The unplugin instance. Reach any bundler adapter off it: `unplugin.vite`,
 * `unplugin.rollup`, `unplugin.esbuild`, `unplugin.webpack`, `unplugin.bun`, ….
 */
export const unplugin: UnpluginInstance<UnpluginStdOptions | undefined> = createUnplugin(unpluginFactory);
