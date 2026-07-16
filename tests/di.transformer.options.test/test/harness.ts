// In-memory test harness for @rhombus-std/di.transformer.options.
//
// Drives a tiny virtual `ts.Program` over fixture sources and runs the
// satellite's `before` factory against it, returning the emitted JS text plus the
// diagnostics it raised. ts-patch is the production runner; tests invoke the
// factory against a Program directly (it needs `ts.Program` + `addDiagnostic`).
//
// A fixture ships a virtual `@rhombus-std/options` package (so the `Options<T>`
// wrapper base tokenizes package-public as `@rhombus-std/options:Options`) plus an
// AMBIENT `declare module '@rhombus-std/di.core'` file declaring
// `ServiceManifestBase` with the `addOptions` overloads. The matcher anchors on
// that declaration site (§41), so the receiver is recognized because its
// `addOptions` member resolves back to the ambient di.core interface — not because
// a type happens to be symbol-named `ServiceManifest`. Token generation reads the
// virtual `package.json` through the injected `readFile`.

import type { Diagnostic } from '@rhombus-std/di.transformer.options/_/diagnostics';
import { createTransformerFactory } from '@rhombus-std/di.transformer.options/_/transformer';
import ts from 'typescript';

/** A virtual filesystem: absolute POSIX path -> file contents. */
export type VirtualFiles = Record<string, string>;

export interface TransformResult {
  /** Emitted JS text, keyed by the source file's virtual path. */
  readonly outputs: Record<string, string>;
  /** Emitted JS text for the single entry file (convenience for 1-file tests). */
  readonly output: string;
  /** Diagnostics the transformer raised, in emission order. */
  readonly diagnostics: readonly Diagnostic[];
}

const PROJ_ROOT = '/proj';
export const APP_PATH = `${PROJ_ROOT}/src/app.ts`;

// The ambient `declare module '@rhombus-std/di.core'` fixture path. A script file
// (no top-level import/export) so the block is an ambient module DECLARATION,
// resolvable without node_modules — added to the program ROOTS but never a
// transform target.
export const DI_CORE_PATH = `${PROJ_ROOT}/src/di-core.ambient.d.ts`;

export interface TransformOptions {
  readonly entry?: readonly string[];
  readonly compilerOptions?: ts.CompilerOptions;
}

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
    rootDir: `${PROJ_ROOT}/src`,
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
    getCurrentDirectory: () => PROJ_ROOT,
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
  // ambient di.core `.d.ts` is loaded and its module declaration registered);
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
  const factory = createTransformerFactory(
    program,
    {
      addDiagnostic(d: Diagnostic) {
        diagnostics.push(d);
        return diagnostics.length;
      },
    },
    {
      // Let token generation see the virtual `package.json` files so the
      // Options wrapper tokenizes package-public.
      readFile: (path) =>
        Object.prototype.hasOwnProperty.call(files, path)
          ? files[path]
          : ts.sys.readFile(path),
    },
  );

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
    output: outputs[APP_PATH] ?? outputs[entry[0]!] ?? '',
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
  return ts.sys.readFile(fileName);
}

function anyFileUnder(files: VirtualFiles, dir: string): boolean {
  const normalized = dir.endsWith('/') ? dir : dir + '/';
  return Object.keys(files).some((f) => f.startsWith(normalized));
}

/**
 * The ambient `declare module '@rhombus-std/di.core'` fixture: a script file
 * declaring `ServiceManifestBase` with the type-driven sugar overload plus the
 * explicit two-arg verb, and its `AddBuilder` continuation. The matcher anchors
 * on the sugar overload's declaration HERE — a receiver whose `addOptions`
 * resolves back to this interface is recognized regardless of the receiver's own
 * symbol name.
 */
const DI_CORE_AMBIENT = `
declare module "@rhombus-std/di.core" {
  export type AddBuilder<Scopes extends string = "singleton"> = { as(scope: Scopes): void };
  export interface ServiceManifestBase<Scopes extends string = "singleton", Provider = unknown> {
    addOptions<T>(): AddBuilder<Scopes>;
    addOptions(token: string, tToken: string): AddBuilder<Scopes>;
  }
}
`;

/**
 * App header for {@link optionsFixture}: imports `ServiceManifestBase` from the
 * ambient di.core module (the positive interface-typed-receiver shape) and keeps
 * a reference to `@rhombus-std/options`'s `Options` so that package is in the
 * program for the wrapper-base lookup.
 */
const APP_HEADER = `
import type { Options } from "@rhombus-std/options";
import type { ServiceManifestBase } from "@rhombus-std/di.core";
export type __KeepOptions<T> = Options<T>;
declare const services: ServiceManifestBase<"singleton">;
`;

/**
 * Build a fixture: the virtual `@rhombus-std/options` package, the ambient
 * di.core module, and `appSource` (prepended with {@link APP_HEADER}) at
 * {@link APP_PATH}.
 */
export function optionsFixture(appSource: string): VirtualFiles {
  return {
    '/proj/node_modules/@rhombus-std/options/package.json': JSON.stringify({
      name: '@rhombus-std/options',
      version: '1.0.0',
      exports: { '.': './index.js' },
    }),
    '/proj/node_modules/@rhombus-std/options/index.d.ts': 'export interface Options<T> { readonly value: T; }\n',
    [DI_CORE_PATH]: DI_CORE_AMBIENT,
    [APP_PATH]: APP_HEADER + appSource,
  };
}

/**
 * Fixture with NO `@rhombus-std/options` package in the program — so the wrapper
 * base cannot be resolved (drives the unlowerable-diagnostic path). The ambient
 * di.core module (and thus the matched receiver) is still present.
 */
export function fixtureWithoutOptions(appSource: string): VirtualFiles {
  const header = `
import type { ServiceManifestBase } from "@rhombus-std/di.core";
declare const services: ServiceManifestBase<"singleton">;
`;
  return {
    [DI_CORE_PATH]: DI_CORE_AMBIENT,
    [APP_PATH]: header + appSource,
  };
}

/**
 * The two string arguments of the single `addOptions(a, b)` call in `output`, or
 * `undefined` when the call is not present / not lowered. Quote-aware over the
 * closed-generic `Options<...>` token (which contains no quotes at this layer).
 */
export function addOptionsArgs(
  output: string,
): { readonly wrapper: string; readonly element: string; } | undefined {
  const match = output.match(/addOptions\(\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\)/);
  if (!match) {
    return undefined;
  }
  return { wrapper: match[1]!, element: match[2]! };
}
