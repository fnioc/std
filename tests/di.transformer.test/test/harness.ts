// In-memory test harness for the @rhombus-std/di.transformer.
//
// Drives a tiny virtual `ts.Program` over fixture sources and runs the
// transformer's `before` factory against it, returning the emitted JS text for
// each file plus the diagnostics the transformer raised. ts-patch is the
// production runner; tests invoke the transformer factory against a Program
// directly (the factory only needs `ts.Program` + `addDiagnostic`).
//
// The harness supports a multi-file virtual filesystem, including synthetic
// `package.json` files, so token generation (package-public vs app-internal)
// can be exercised deterministically without touching real `node_modules`.

import type { Diagnostic } from '@rhombus-std/di.transformer/_/diagnostics';
import { createTransformerFactory } from '@rhombus-std/di.transformer/_/transformer';
import ts from 'typescript';

/** A virtual filesystem: absolute POSIX path → file contents. */
export type VirtualFiles = Record<string, string>;

export interface TransformResult {
  /** Emitted JS text, keyed by the source file's virtual path. */
  readonly outputs: Record<string, string>;
  /** Emitted JS text for the single entry file (convenience for 1-file tests). */
  readonly output: string;
  /** Diagnostics the transformer raised, in emission order. */
  readonly diagnostics: readonly Diagnostic[];
}

const DEFAULT_ROOT = '/virtual';

export interface TransformOptions {
  /** Entry files to transform (absolute virtual paths). Defaults to all `.ts`. */
  readonly entry?: readonly string[];
  /** Extra compiler options merged over the harness defaults. */
  readonly compilerOptions?: ts.CompilerOptions;
}

// The ambient `declare module '@rhombus-std/di.core'` fixture: the authoring
// interfaces the transformer's forms are declared on — with BOTH the runtime
// overloads and the sugar overloads the transformer merges — plus the authoring
// brands. A receiver typed against these interfaces has its `add` / `resolve` /
// `as` member resolve back HERE, which is what the declaration-site matcher
// anchors on. A script `.d.ts` (no top-level import/export) so the block is an
// ambient module declaration, resolvable without a node_modules package.
export const DI_CORE_AMBIENT = `
declare module "@rhombus-std/di.core" {
  export type Token = string;
  export type Ctor<A extends any[] = any[], I = unknown> = new(...args: A) => I;
  export type Func<A extends any[] = any[], R = unknown> = (...args: A) => R;
  export type DepSlot = unknown;

  export interface AddBuilder<Scopes extends string = string> {
    as(scope: Scopes): void;
    as<S extends Scopes>(): void;
  }
  export interface IServiceManifestBase<Scopes extends string = string, Provider = unknown> {
    add(token: Token, ctor: Ctor, signatures?: readonly (readonly DepSlot[])[]): AddBuilder<Scopes>;
    add<I>(ctor: Ctor<any[], I>): AddBuilder<Scopes>;
    add<I>(ctor: Ctor<any[], I>, overrides: readonly (string | undefined)[]): AddBuilder<Scopes>;
    add<I>(factory: Func<any[], I>): AddBuilder<Scopes>;
    addFactory(token: Token, factory: Func<any[], unknown>, signatures?: readonly (readonly DepSlot[])[]): AddBuilder<Scopes>;
    addFactory<I>(factory: Func<any[], I>): AddBuilder<Scopes>;
    addValue(token: Token, value: unknown): void;
    addValue<I>(value: I): void;
    build(options?: unknown): Provider;
  }
  export interface IRequiredResolver {
    resolve<T>(token: Token, key?: string): T;
    resolve(token: Token, key?: string): unknown;
    resolve<T>(): T;
    resolve<F extends (...args: any[]) => any>(): ReturnType<F>;
  }
  export interface IServiceQuery {
    isService(token: Token): boolean;
    isService<T>(): boolean;
  }
  export interface IResolver extends IRequiredResolver, IServiceQuery {
    resolveAsync<T>(token: Token): Promise<T>;
    resolveAsync<T>(): Promise<T>;
    resolveAsync<F extends (...args: any[]) => any>(): Promise<Awaited<ReturnType<F>>>;
    tryResolve<T>(token: Token, key?: string): T | undefined;
    tryResolve<T>(): T | undefined;
    resolveFactory<F>(type: Token, params?: readonly Token[]): F;
  }
  export interface IServiceProvider<S extends string = string> extends IResolver {
    createScope(name?: S): IServiceProvider<S>;
    readonly name: S;
    dispose(): void;
  }
  export type IServiceManifest<S extends string = string> = IServiceManifestBase<S, IServiceProvider<S>>;

  // Same-named authoring interfaces NESTED in a namespace inside the declaring
  // module. The nearest enclosing module scope is \`Nested\` (identifier-named),
  // not the module, so a receiver typed \`Nested.IServiceManifestBase\` /
  // \`Nested.IResolver\` must NOT match.
  export namespace Nested {
    export interface IServiceManifestBase<Scopes extends string = string> {
      add<I>(ctor: Ctor<any[], I>): AddBuilder<Scopes>;
    }
    export interface IResolver {
      resolve<T>(): T;
    }
  }

  const TOK: unique symbol;
  export type Inject<T, K extends Token> = T & { readonly [TOK]?: K };
  const HOLE: unique symbol;
  export type Hole<N extends number, C = unknown> = C & { readonly [HOLE]?: N };
  export type $<N extends number> = Hole<N>;
  const ARG: unique symbol;
  export type Typeof<T> = Token & { readonly [ARG]?: T };
  const KEY: unique symbol;
  export type Keyed<T, K extends Token> = T & { readonly [KEY]?: K };
}
`;

// The typed fixture receivers, declared GLOBALLY so every app source can call the
// authored forms on them without a per-file import. Typing them as the di.core
// interfaces (not `any`) is what lets the declaration-site matcher resolve their
// members back to the ambient module. A module `.d.ts` (the `import type` makes it
// one) whose `declare global` publishes the receivers program-wide.
const DI_CORE_RECEIVERS = `import type { IServiceManifest, IServiceProvider } from "@rhombus-std/di.core";
declare global {
  const services: IServiceManifest<string>;
  const scope: IServiceProvider<string>;
  const provider: IServiceProvider<string>;
  const root: IServiceProvider<string>;
}
`;

/**
 * The ambient di.core module + global typed receivers, spread into any fixture
 * file map so the transformer's forms anchor. Fixed `/virtual` paths — ambient
 * module and global declarations apply program-wide regardless of the app's own
 * location, so the same two files serve every fixture root.
 */
export const DI_CORE_FILES: VirtualFiles = {
  '/virtual/di-core.ambient.d.ts': DI_CORE_AMBIENT,
  '/virtual/di-core.receivers.d.ts': DI_CORE_RECEIVERS,
};

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
  // ambient di.core `.d.ts` is loaded and its module declaration registered);
  // transform targets are the emittable `.ts` app files (or an explicit `entry`).
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
      // package-public vs app-internal distinction is testable in-memory.
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
  // Allow the real default-lib directory through so Promise/primitives resolve.
  return ts.sys.readFile(fileName);
}

function anyFileUnder(files: VirtualFiles, dir: string): boolean {
  const normalized = dir.endsWith('/') ? dir : dir + '/';
  return Object.keys(files).some((f) => f.startsWith(normalized));
}

/**
 * Convenience: build a fixture under the default virtual root — the ambient
 * di.core module + global typed receivers ({@link DI_CORE_FILES}, so the authored
 * forms anchor) plus the app file.
 */
export function fixture(source: string, name = 'app.ts'): VirtualFiles {
  return {
    ...DI_CORE_FILES,
    [`${DEFAULT_ROOT}/${name}`]: source,
  };
}

/**
 * Pull the `[[...]]` signature array text out of the inline registration call
 * for the given class/factory. Signatures ride ON the registration as the third
 * argument: `add("token", Ctor, [[...]])` / `addFactory("token", fn, [[...]])`.
 * We locate the `, ${ctor}, ` boundary and balanced-scan the `[[...]]`.
 */
export function depsArrayFor(output: string, ctor: string): string {
  const marker = `, ${ctor}, `;
  const at = output.indexOf(marker);
  if (at < 0) {
    throw new Error(`no inline signature for ${ctor} in:\n${output}`);
  }
  const start = output.indexOf('[', at + marker.length);
  if (start < 0) {
    throw new Error(`no signature array for ${ctor} in:\n${output}`);
  }
  let depth = 0;
  for (let i = start; i < output.length; i++) {
    const ch = output[i];
    if (ch === '[') {
      depth += 1;
    } else if (ch === ']') {
      depth -= 1;
      if (depth === 0) {
        return output.slice(start, i + 1);
      }
    }
  }
  throw new Error(`unbalanced signature array for ${ctor} in:\n${output}`);
}

/** The virtual entry path a {@link withCoreBrand} fixture places `appSource` at. */
export const CORE_BRAND_APP = '/proj/src/app.ts';

/**
 * Build a fixture backed by the ambient `@rhombus-std/di.core` module (which
 * exports the `Inject<T, K>` / `Keyed<T, K>` brands alongside the authoring
 * interfaces), with `appSource` ({@link APP_HEADER} + source) as the entry file at
 * {@link CORE_BRAND_APP}. Lets brand-detection tests reference
 * `@rhombus-std/di.core` without a real `node_modules`.
 */
export function withCoreBrand(appSource: string): VirtualFiles {
  return {
    ...DI_CORE_FILES,
    [CORE_BRAND_APP]: appSource,
  };
}

export const ROOT = DEFAULT_ROOT;
