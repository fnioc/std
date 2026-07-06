// In-memory test harness for @rhombus-std/config.transformer.
//
// Drives a tiny virtual `ts.Program` over fixture sources and runs the
// transformer's `before` factory against it, returning the emitted text for each
// file plus the diagnostics the transformer raised. ts-patch is the production
// runner; tests invoke the transformer factory against a Program directly (the
// factory only needs `ts.Program` + `addDiagnostic`).
//
// Fixtures prepend `BUILDER_STUB`: a local `ConfigurationBuilder<T>` class so
// the checker sees a `ConfigurationBuilder`-symboled receiver without the real
// package. The injected `@rhombus-std/config` import is never resolved -- it only
// affects printed text (what the injection tests assert); `ts.transform` prints
// without re-checking, so the unresolved specifier is fine.

import type { Diagnostic } from "@rhombus-std/config.transformer/internal/diagnostics";
import { createTransformerFactory } from "@rhombus-std/config.transformer/internal/transformer";
import ts from "typescript";

/** A virtual filesystem: absolute POSIX path -> file contents. */
export type VirtualFiles = Record<string, string>;

export interface TransformResult {
  /** Emitted text, keyed by the source file's virtual path. */
  readonly outputs: Record<string, string>;
  /** Emitted text for the single entry file (convenience for 1-file tests). */
  readonly output: string;
  /** Diagnostics the transformer raised, in emission order. */
  readonly diagnostics: readonly Diagnostic[];
}

const DEFAULT_ROOT = "/virtual";

export interface TransformOptions {
  /** Entry files to transform (absolute virtual paths). Defaults to all `.ts`. */
  readonly entry?: readonly string[];
  /** Extra compiler options merged over the harness defaults. */
  readonly compilerOptions?: ts.CompilerOptions;
}

/**
 * A local `ConfigurationBuilder<T>` stub with the shape the transformer matches
 * against: `add`, `withType<U>()`, and `withSchema`. Prepended to fixtures so
 * the checker resolves a `ConfigurationBuilder`-symboled receiver without the
 * real `@rhombus-std/config` package.
 */
export const BUILDER_STUB = `
declare const OPTIONAL: unique symbol;
class ConfigurationBuilder<T = unknown> {
  add(source: unknown): this { return this; }
  withType<U>(): ConfigurationBuilder<U> { return this as any; }
  withSchema(schema: unknown): ConfigurationBuilder<unknown> { return this as any; }
}
`;

/**
 * Compile `files` into an in-memory Program and run the transformer over the
 * entry files. Returns emitted text + raised diagnostics.
 */
export function transform(
  files: VirtualFiles,
  options: TransformOptions = {},
): TransformResult {
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ["lib.es2022.d.ts"],
    strict: true,
    skipLibCheck: true,
    noEmitOnError: false,
    types: [],
    ...options.compilerOptions,
  };

  const libFileName = ts.getDefaultLibFileName(compilerOptions);
  const libSourcePath = ts.getDefaultLibFilePath(compilerOptions);

  const host: ts.CompilerHost = {
    getSourceFile(fileName, languageVersion) {
      const text = readVirtualOrReal(files, fileName, libFileName, libSourcePath);
      if (text === undefined) {
        return undefined;
      }
      return ts.createSourceFile(fileName, text, languageVersion, true);
    },
    getDefaultLibFileName: () => libFileName,
    getDefaultLibLocation: () => libSourcePath.replace(/[^/\\]+$/, ""),
    writeFile: () => undefined,
    getCurrentDirectory: () => DEFAULT_ROOT,
    getCanonicalFileName: (f) => f,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    fileExists(fileName) {
      return (
        Object.prototype.hasOwnProperty.call(files, fileName)
        || fileName === libFileName
        || fileName === libSourcePath
        || ts.sys.fileExists(fileName)
      );
    },
    readFile(fileName) {
      return readVirtualOrReal(files, fileName, libFileName, libSourcePath);
    },
    directoryExists(dirName) {
      if (anyFileUnder(files, dirName)) {
        return true;
      }
      return ts.sys.directoryExists?.(dirName) ?? false;
    },
    getDirectories(dirName) {
      return ts.sys.getDirectories?.(dirName) ?? [];
    },
    realpath: (f) => f,
  };

  const entry = options.entry
    ?? Object.keys(files).filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"));

  const program = ts.createProgram(entry.slice(), compilerOptions, host);

  const diagnostics: Diagnostic[] = [];
  const factory = createTransformerFactory(program, {
    addDiagnostic(d: Diagnostic) {
      diagnostics.push(d);
      return diagnostics.length;
    },
  });

  const outputs: Record<string, string> = {};
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

  for (const fileName of entry) {
    const sourceFile = program.getSourceFile(fileName);
    if (!sourceFile) {
      throw new Error(`entry file not in program: ${fileName}`);
    }
    const result = ts.transform(sourceFile, [factory], compilerOptions);
    const transformed = result.transformed[0]!;
    outputs[fileName] = printer.printFile(transformed as ts.SourceFile);
    result.dispose();
  }

  return {
    outputs,
    output: outputs[entry[0]!] ?? "",
    diagnostics,
  };
}

function readVirtualOrReal(
  files: VirtualFiles,
  fileName: string,
  libFileName: string,
  libSourcePath: string,
): string | undefined {
  if (Object.prototype.hasOwnProperty.call(files, fileName)) {
    return files[fileName];
  }
  if (fileName === libFileName || fileName === libSourcePath) {
    return ts.sys.readFile(libSourcePath);
  }
  // Allow the real default-lib directory through so primitives resolve.
  return ts.sys.readFile(fileName);
}

function anyFileUnder(files: VirtualFiles, dir: string): boolean {
  const normalized = dir.endsWith("/") ? dir : dir + "/";
  return Object.keys(files).some((f) => f.startsWith(normalized));
}

/**
 * Build a one-file fixture under the default virtual root, with the
 * {@link BUILDER_STUB} prepended so `ConfigurationBuilder` resolves.
 */
export function fixture(source: string, name = "app.ts"): VirtualFiles {
  return { [`${DEFAULT_ROOT}/${name}`]: BUILDER_STUB + source };
}

export const ROOT = DEFAULT_ROOT;
