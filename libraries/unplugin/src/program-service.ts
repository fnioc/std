// ProgramService — a LanguageService-backed shared `ts.Program` the unified
// plugin drives every transform through.
//
// unplugin (and Bun) give us NO shared-Program facility, so we own it. A single
// `ts.LanguageService` over the consumer's own tsconfig gives incremental,
// cross-file type-aware transforms: the transformers are all hard type-aware
// (checker resolution, cross-package export-graph scans), so each file must be
// transformed against the WHOLE program, not in isolation.
//
// Files come from two places: the tsconfig's own `include` (parsed via
// `getParsedCommandLineOfConfigFile`, so `customConditions`, `types`, and
// `moduleResolution` are inherited — never hand-assembled), plus an in-memory
// OVERLAY the bundler feeds through `transformFile`. When the bundler hands us a
// file not under the tsconfig's include (e.g. a virtual or out-of-tree module),
// it is added as an extra root on demand.

import { dirname, resolve } from "node:path";
import ts from "typescript";
import { DEFAULT_TRANSFORMS, type DiagnosticSink, type TransformName, TRANSFORMS } from "./registry.js";

/** Options for {@link createProgramService}. */
export interface ProgramServiceOptions {
  /** Path to the consumer's `tsconfig.json` (absolute or CWD-relative). */
  readonly tsconfigPath: string;
}

/** The result of transforming one file. */
export interface TransformFileResult {
  /** The printed, transformed source text. */
  readonly text: string;
  /** Diagnostics the transformers raised for this file, in emission order. */
  readonly diagnostics: readonly ts.Diagnostic[];
}

interface OverlayEntry {
  text: string;
  version: number;
}

interface FactoryCache {
  readonly program: ts.Program;
  readonly factories: Map<TransformName, ts.TransformerFactory<ts.SourceFile>>;
}

/**
 * A shared, incremental `ts.Program` (via `ts.LanguageService`) plus a per-file
 * transform driver. One instance is created per bundler build and reused across
 * every `transform` hook call.
 */
export class ProgramService {
  readonly #overlay = new Map<string, OverlayEntry>();
  readonly #extraRoots = new Set<string>();
  readonly #rootFiles: string[];
  readonly #options: ts.CompilerOptions;
  readonly #currentDirectory: string;
  readonly #service: ts.LanguageService;
  readonly #printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  readonly #sink: DiagnosticSink;

  #currentDiagnostics: ts.Diagnostic[] | undefined;
  #factoryCache: FactoryCache | undefined;
  // Test-visible counter: how many transformer factories have been built. A
  // stable count across repeated same-program transforms proves the cache hits;
  // an increase after the program changes proves invalidation.
  #factoryBuildCount = 0;

  constructor(options: ProgramServiceOptions) {
    const tsconfigPath = this.#norm(resolve(options.tsconfigPath));
    this.#currentDirectory = dirname(tsconfigPath);

    const parsed = parseTsconfig(tsconfigPath);
    this.#rootFiles = parsed.fileNames.map((name) => this.#norm(name));
    this.#options = parsed.options;

    this.#sink = {
      addDiagnostic: (diagnostic) => {
        this.#currentDiagnostics?.push(diagnostic);
        return this.#currentDiagnostics?.length ?? 0;
      },
    };

    this.#service = ts.createLanguageService(this.#createHost(), ts.createDocumentRegistry());
  }

  /**
   * Transform `code` for `id` under the active transform set. If `code` differs
   * from the current snapshot the overlay is updated and its version bumped; the
   * shared Program is refreshed, the file added as a root if absent, then ONE
   * `ts.transform` pass runs every active before-factory in order.
   */
  transformFile(
    id: string,
    code: string,
    transforms: readonly TransformName[] = DEFAULT_TRANSFORMS,
  ): TransformFileResult {
    const key = this.#norm(resolve(id));
    this.#setOverlay(key, code);

    let program = this.#service.getProgram();
    if (!program) {
      throw new Error("@rhombus-std/unplugin: LanguageService produced no Program");
    }
    let sourceFile = program.getSourceFile(key);
    if (!sourceFile) {
      // Not covered by the tsconfig's include — add as a root and refresh.
      this.#extraRoots.add(key);
      program = this.#service.getProgram();
      if (!program) {
        throw new Error("@rhombus-std/unplugin: LanguageService produced no Program");
      }
      sourceFile = program.getSourceFile(key);
    }
    if (!sourceFile) {
      throw new Error(`@rhombus-std/unplugin: file not resolvable into the Program: ${key}`);
    }

    const factories = this.#factoriesFor(program, transforms);
    const diagnostics: ts.Diagnostic[] = [];
    this.#currentDiagnostics = diagnostics;
    try {
      const result = ts.transform(sourceFile, factories.slice(), this.#options);
      const transformed = result.transformed[0] as ts.SourceFile;
      const text = this.#printer.printFile(transformed);
      result.dispose();
      return { text, diagnostics };
    } finally {
      this.#currentDiagnostics = undefined;
    }
  }

  /** The current shared Program (test/introspection seam). */
  __program(): ts.Program | undefined {
    return this.#service.getProgram();
  }

  /** The overlay version for `id`, or 0 if the file has no overlay entry. */
  __scriptVersion(id: string): number {
    return this.#overlay.get(this.#norm(resolve(id)))?.version ?? 0;
  }

  /** True once `id` is resolvable into the current Program. */
  __hasSourceFile(id: string): boolean {
    const program = this.#service.getProgram();
    return Boolean(program?.getSourceFile(this.#norm(resolve(id))));
  }

  /** Total transformer factories built so far (cache-hit/invalidation probe). */
  __factoryBuildCount(): number {
    return this.#factoryBuildCount;
  }

  #setOverlay(key: string, code: string): void {
    const existing = this.#overlay.get(key);
    if (existing && existing.text === code) {
      return;
    }
    this.#overlay.set(key, { text: code, version: (existing?.version ?? 0) + 1 });
  }

  #factoriesFor(
    program: ts.Program,
    transforms: readonly TransformName[],
  ): ts.TransformerFactory<ts.SourceFile>[] {
    if (!this.#factoryCache || this.#factoryCache.program !== program) {
      // Program instance changed — the old factories are bound to a stale
      // TypeChecker and must be discarded.
      this.#factoryCache = { program, factories: new Map() };
    }
    const cache = this.#factoryCache.factories;
    const out: ts.TransformerFactory<ts.SourceFile>[] = [];
    for (const name of transforms) {
      let factory = cache.get(name);
      if (!factory) {
        factory = TRANSFORMS[name].build(program, this.#sink);
        cache.set(name, factory);
        this.#factoryBuildCount += 1;
      }
      out.push(factory);
    }
    return out;
  }

  #createHost(): ts.LanguageServiceHost {
    return {
      getScriptFileNames: () => {
        const names = new Set<string>(this.#rootFiles);
        for (const extra of this.#extraRoots) {
          names.add(extra);
        }
        return [...names];
      },
      getScriptVersion: (fileName) => {
        const overlay = this.#overlay.get(this.#norm(fileName));
        // Disk-only files never change during a single build, so a constant
        // version is correct; overlay files carry the incrementing version.
        return overlay ? String(overlay.version) : "0";
      },
      getScriptSnapshot: (fileName) => {
        const overlay = this.#overlay.get(this.#norm(fileName));
        if (overlay) {
          return ts.ScriptSnapshot.fromString(overlay.text);
        }
        const text = ts.sys.readFile(fileName);
        return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
      },
      getCurrentDirectory: () => this.#currentDirectory,
      getCompilationSettings: () => this.#options,
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      fileExists: (fileName) => this.#overlay.has(this.#norm(fileName)) || ts.sys.fileExists(fileName),
      readFile: (fileName) => this.#overlay.get(this.#norm(fileName))?.text ?? ts.sys.readFile(fileName),
      readDirectory: (path, extensions, exclude, include, depth) =>
        ts.sys.readDirectory(path, extensions, exclude, include, depth),
      directoryExists: (directoryName) => ts.sys.directoryExists(directoryName),
      getDirectories: (path) => ts.sys.getDirectories(path),
      realpath: (path) => ts.sys.realpath?.(path) ?? path,
    };
  }

  #norm(path: string): string {
    return path.replace(/\\/g, "/");
  }
}

/** Build a {@link ProgramService} for the given tsconfig. */
export function createProgramService(options: ProgramServiceOptions): ProgramService {
  return new ProgramService(options);
}

function parseTsconfig(tsconfigPath: string): ts.ParsedCommandLine {
  const host: ts.ParseConfigFileHost = {
    fileExists: (fileName) => ts.sys.fileExists(fileName),
    readFile: (fileName) => ts.sys.readFile(fileName),
    readDirectory: (path, extensions, exclude, include, depth) =>
      ts.sys.readDirectory(path, extensions, exclude, include, depth),
    useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
    getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
      throw new Error(`@rhombus-std/unplugin: cannot read ${tsconfigPath}: ${message}`);
    },
  };
  const parsed = ts.getParsedCommandLineOfConfigFile(tsconfigPath, undefined, host);
  if (!parsed) {
    throw new Error(`@rhombus-std/unplugin: failed to parse ${tsconfigPath}`);
  }
  return parsed;
}
