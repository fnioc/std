// In-memory test harness for @rhombus-std/config.transformer.
//
// Drives a tiny virtual `ts.Program` over fixture sources and runs the
// transformer's `before` factory against it, returning the emitted text for each
// file plus the diagnostics the transformer raised. ts-patch is the production
// runner; tests invoke the transformer factory against a Program directly (the
// factory only needs `ts.Program` + `addDiagnostic`).
//
// Fixtures ship an AMBIENT `declare module '@rhombus-std/config'` file that
// declares the `ConfigBuilder` class (its runtime value) MERGED with a
// same-name interface carrying `withType<U>()` — exactly the class/augment split
// the real package uses. The matcher anchors on that interface's declaration
// site (§41): a receiver is recognized because its `withType` member resolves
// back to the ambient config interface, not because a type is symbol-named
// `ConfigBuilder`. The app imports `ConfigBuilder` from the barrel.

import type { Diagnostic } from '@rhombus-std/config.transformer/_/diagnostics';
import { createTransformerFactory } from '@rhombus-std/config.transformer/_/transformer';
import ts from 'typescript';

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

const DEFAULT_ROOT = '/virtual';

// The ambient `declare module '@rhombus-std/config'` fixture path — a script
// `.d.ts` (no top-level import/export) so the block is an ambient module
// DECLARATION, resolvable without node_modules. Added to the program ROOTS but
// never a transform target.
const CONFIG_PATH = `${DEFAULT_ROOT}/config.ambient.d.ts`;

export interface TransformOptions {
  /** Entry files to transform (absolute virtual paths). Defaults to all `.ts`. */
  readonly entry?: readonly string[];
  /** Extra compiler options merged over the harness defaults. */
  readonly compilerOptions?: ts.CompilerOptions;
}

/**
 * The ambient `@rhombus-std/config` module: the `ConfigBuilder` class (the
 * runtime value, with `add`/`withSchema`) declaration-MERGED with a same-name
 * interface carrying `withType<U>()`, plus `OPTIONAL`. The matcher anchors on the
 * interface's `withType` declaration HERE — a receiver whose `withType` resolves
 * back to it is recognized regardless of the receiver's own symbol name.
 */
const CONFIG_AMBIENT = `
declare module "@rhombus-std/config" {
  export const OPTIONAL: unique symbol;
  export class ConfigBuilder<T = unknown> {
    add(source: unknown): this;
    withSchema(schema: unknown): ConfigBuilder<unknown>;
  }
  export interface ConfigBuilder<T = unknown> {
    withType<U>(): ConfigBuilder<U>;
  }
  // A same-named interface NESTED in a namespace inside the declaring module.
  // The nearest enclosing module scope is \`Nested\` (identifier-named), not the
  // module, so a receiver typed \`Nested.ConfigBuilder\` must NOT match.
  export namespace Nested {
    export interface ConfigBuilder<T = unknown> {
      withType<U>(): ConfigBuilder<U>;
    }
  }
}
`;

/**
 * App header: imports `ConfigBuilder` from the config barrel (the positive
 * class-value receiver whose `withType` resolves to the ambient interface).
 */
const APP_HEADER = `import { ConfigBuilder } from "@rhombus-std/config";\n`;

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
    lib: ['lib.es2022.d.ts'],
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
    getDefaultLibLocation: () => libSourcePath.replace(/[^/\\]+$/, ''),
    writeFile: () => undefined,
    getCurrentDirectory: () => DEFAULT_ROOT,
    getCanonicalFileName: (f) => f,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
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

  // Program roots include every non-node_modules `.ts`/`.d.ts` fixture (so the
  // ambient config `.d.ts` is loaded and its module declaration registered);
  // transform targets are the emittable `.ts` app files only.
  const roots = Object.keys(files).filter(
    (f) => (f.endsWith('.ts') || f.endsWith('.d.ts')) && !f.includes('/node_modules/'),
  );
  const entry = options.entry
    ?? Object.keys(files).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.d.ts') && !f.includes('/node_modules/'),
    );

  const program = ts.createProgram(roots.slice(), compilerOptions, host);

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
    output: outputs[entry[0]!] ?? '',
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
  const normalized = dir.endsWith('/') ? dir : dir + '/';
  return Object.keys(files).some((f) => f.startsWith(normalized));
}

/**
 * Build a fixture: the ambient `@rhombus-std/config` module plus an app file
 * ({@link APP_HEADER} + `source`) under the default virtual root. The header
 * imports `ConfigBuilder` from the barrel so the receiver's `withType`
 * resolves to the ambient interface the matcher anchors on.
 */
export function fixture(source: string, name = 'app.ts'): VirtualFiles {
  return {
    [CONFIG_PATH]: CONFIG_AMBIENT,
    [`${DEFAULT_ROOT}/${name}`]: APP_HEADER + source,
  };
}

export const ROOT = DEFAULT_ROOT;
