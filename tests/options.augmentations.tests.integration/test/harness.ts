// Integration harness — drives the REAL `tspc` over a temp project wired with
// BOTH transformer plugins (`@rhombus-std/di.transformer` + its options
// satellite), compiles a type-driven sample, and returns a way to LOAD the
// lowered output so it runs against the di engine + the options augmentation.
//
// It extends di.tests.integration's harness: the options story additionally
// links @rhombus-std/options, @rhombus-std/options.augmentations (and its runtime
// deps config.core + primitives) and adds the satellite plugin, so the emitted
// `services.addOptions<T>()` lowering actually resolves an `Options<T>`.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const PKG_ROOT = resolve(import.meta.dir, "..");
const REPO_ROOT = resolve(PKG_ROOT, "..", "..");
const TSPC = join(PKG_ROOT, "node_modules", "ts-patch", "bin", "tspc.js");

/** One source file in the temp project, keyed by its path under `src/`. */
export type SampleFiles = Record<string, string>;

export interface CompiledProject {
  readonly projDir: string;
  readonly emitted: (relPath: string) => string;
  readonly load: (relPath: string) => Promise<Record<string, unknown>>;
  readonly cleanup: () => void;
}

function link(target: string, linkPath: string): void {
  try {
    symlinkSync(target, linkPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
      throw err;
    }
  }
}

/**
 * Compile `files` (a `src/`-relative map) with BOTH transformer plugins via
 * tspc, emitting ESM into `dist/`. Returns handles to read and dynamically
 * import the lowered output. Throws (surfacing tspc output) on failure.
 */
export function compileWithTransformer(files: SampleFiles): CompiledProject {
  const projDir = mkdtempSync(join(tmpdir(), "fnioc-options-integration-"));
  const nm = join(projDir, "node_modules");
  mkdirSync(join(nm, "@rhombus-std"), { recursive: true });
  mkdirSync(join(projDir, "src"), { recursive: true });

  link(join(REPO_ROOT, "node_modules", "typescript"), join(nm, "typescript"));
  link(join(PKG_ROOT, "node_modules", "ts-patch"), join(nm, "ts-patch"));
  for (
    const lib of [
      "di.core",
      "di",
      "di.transformer",
      "di.transformer.options",
      "options",
      "options.augmentations",
      "config.core",
      "primitives",
    ]
  ) {
    link(join(REPO_ROOT, "libraries", lib), join(nm, "@rhombus-std", lib));
  }

  for (const [rel, source] of Object.entries(files)) {
    const dest = join(projDir, "src", rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, source);
  }

  writeFileSync(
    join(projDir, "package.json"),
    JSON.stringify({ name: "fnioc-options-integration-sample", type: "module", private: true }),
  );
  writeFileSync(
    join(projDir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        // DOM for `AbortSignal` — under `customConditions: built`, options.augmentations
        // resolves to types=src, pulling primitives' source (which references
        // `AbortSignal`) into this program. A real app has DOM or node types.
        lib: ["ES2022", "ESNext.Disposable", "DOM"],
        strict: true,
        outDir: "dist",
        rootDir: "src",
        skipLibCheck: true,
        noEmitOnError: false,
        experimentalDecorators: false,
        // Both transformers' `declare module` augmentations enter the program so
        // the sample's authored forms (`add<I>()`, `.as<"x">()`, `resolve<T>()`,
        // `addOptions<T>()`) type-check.
        types: ["@rhombus-std/di.transformer", "@rhombus-std/di.transformer.options"],
        // di + di.core to their BUILT `.d.ts` — di's source cannot co-compile
        // under the augmentation (see di.tests.integration).
        customConditions: ["built"],
        plugins: [
          { transform: "@rhombus-std/di.transformer", import: "transform" },
          { transform: "@rhombus-std/di.transformer.options", import: "transform" },
        ],
      },
      include: ["src/**/*"],
    }),
  );

  const result = spawnSync("node", [TSPC, "-p", "tsconfig.json"], {
    cwd: projDir,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const out = (result.stdout ?? "") + (result.stderr ?? "");
    rmSync(projDir, { recursive: true, force: true });
    throw new Error(`tspc failed (status ${result.status}):\n${out}`);
  }

  return {
    projDir,
    emitted: (relPath) => readFileSync(join(projDir, "dist", relPath), "utf8"),
    load: (relPath) => {
      const withExt = relPath.endsWith(".js") ? relPath : `${relPath}.js`;
      const url = `file://${join(projDir, "dist", withExt)}?t=${Date.now()}-${Math.random()}`;
      return import(url) as Promise<Record<string, unknown>>;
    },
    cleanup: () => rmSync(projDir, { recursive: true, force: true }),
  };
}
