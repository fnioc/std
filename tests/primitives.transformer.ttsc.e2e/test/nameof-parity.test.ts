import { beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Production-path e2e parity: drives the REAL ttsc (typescript-go toolchain) over
// a temp project that wires the Go nameof plugin through the `@rhombus-std/
// primitives.transformer/ttsc` descriptor, then asserts the emitted JS carries
// the SAME byte-identical token strings the hand-written TypeScript nameof
// transformer produces (the parity corpus lives in
// tests/di.transformer.test/test/{tokens,nameof}.test.ts).
//
// The fixture path is STABLE (not mkdtemp) so the project-local ttsc plugin cache
// (node_modules/.cache/ttsc) survives across runs: the first run pays the cold
// ~5-minute Go plugin build, later runs are instant.
//
// This suite needs the Go toolchain, so it is kept OUT of the default
// `bun run test` gate (script `test:e2e`, not `test`) and self-skips when go is
// not resolvable — run it deliberately with `bun run --filter '*' test:e2e`.
//
// Toolchain: ttsc ships its own Go SDK and prefers it, but it inherits GOROOT
// from the ambient (mise) environment — a version split there makes the plugin
// compile fail. We pin the build to a single self-consistent toolchain by
// pointing TTSC_GO_BINARY at mise's go and forcing GOTOOLCHAIN=local.

const goToolchain = spawnSync("mise", ["which", "go"], { encoding: "utf8" });
const toolchainReady = goToolchain.status === 0 && goToolchain.stdout.trim().length > 0;

const PKG_ROOT = resolve(import.meta.dir, "..");
const REPO_ROOT = resolve(PKG_ROOT, "..", "..");
const TTSC = join(PKG_ROOT, "node_modules", "ttsc", "lib", "launcher", "ttsc.js");
const TS7 = join(PKG_ROOT, "node_modules", "typescript");
const UNPLUGIN = join(PKG_ROOT, "node_modules", "@ttsc", "unplugin");
const PRIM = join(REPO_ROOT, "libraries", "primitives.transformer");

const projDir = join(tmpdir(), "fnioc-ttsc-nameof-e2e");
const COLD_BUILD_MS = 420_000;

function link(target: string, linkPath: string): void {
  try {
    symlinkSync(target, linkPath);
  } catch {
    // Ignore EEXIST from a re-run; link targets are stable.
  }
}

/** A build env with a single self-consistent Go toolchain (see file header). */
function goEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env } as NodeJS.ProcessEnv;
  delete env.GOROOT;
  delete env.GOBIN;
  env.GOTOOLCHAIN = "local";
  const miseGo = spawnSync("mise", ["which", "go"], { encoding: "utf8" });
  const goBin = miseGo.status === 0 ? miseGo.stdout.trim() : "";
  if (goBin) {
    env.TTSC_GO_BINARY = goBin;
  }
  return env;
}

let app = "";

beforeAll(() => {
  if (!toolchainReady) {
    return;
  }
  const nm = join(projDir, "node_modules");
  mkdirSync(join(nm, "@rhombus-std"), { recursive: true });
  mkdirSync(join(nm, "@ttsc"), { recursive: true });
  mkdirSync(join(projDir, "src"), { recursive: true });
  rmSync(join(projDir, "dist"), { recursive: true, force: true });

  link(TS7, join(nm, "typescript"));
  link(join(PKG_ROOT, "node_modules", "ttsc"), join(nm, "ttsc"));
  link(UNPLUGIN, join(nm, "@ttsc", "unplugin"));
  link(PRIM, join(nm, "@rhombus-std", "primitives.transformer"));

  // A package-public library with an exports subpath map AND a root re-export of
  // a deeply-declared interface — the release-critical augmentation-token shape.
  const lib = join(nm, "your-lib");
  mkdirSync(join(lib, "contracts"), { recursive: true });
  mkdirSync(join(lib, "internal"), { recursive: true });
  writeFileSync(
    join(lib, "package.json"),
    JSON.stringify({
      name: "your-lib",
      version: "3.4.5",
      exports: { ".": "./index.js", "./contracts": "./contracts/index.js" },
    }),
  );
  writeFileSync(join(lib, "index.d.ts"), `export { Deep } from "./internal/deep";\n`);
  writeFileSync(join(lib, "internal", "deep.d.ts"), `export interface Deep {}\n`);
  writeFileSync(join(lib, "contracts", "index.d.ts"), `export interface IFoo {}\n`);

  writeFileSync(join(projDir, "src", "nameof.ts"), `export declare function nameof<T>(): string;\n`);
  writeFileSync(
    join(projDir, "src", "app.ts"),
    `
import { nameof } from "./nameof";
import { IFoo } from "your-lib/contracts";
import { Deep } from "your-lib";
interface ILocal {}
export const appInternal = nameof<ILocal>();
export const asyncToken = nameof<Promise<ILocal>>();
export const packagePublic = nameof<IFoo>();
export const bareReexport = nameof<Deep>();
`,
  );
  writeFileSync(
    join(projDir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        lib: ["ES2022"],
        strict: true,
        outDir: "dist",
        rootDir: "src",
        skipLibCheck: true,
        noEmitOnError: false,
        plugins: [{ transform: "@rhombus-std/primitives.transformer/ttsc" }],
      },
      include: ["src/**/*"],
    }),
  );

  const result = spawnSync("node", [TTSC, "-p", "tsconfig.json"], {
    cwd: projDir,
    encoding: "utf8",
    env: goEnv(),
  });
  if (result.status !== 0) {
    throw new Error(`ttsc failed (status ${result.status}):\n${result.stdout}\n${result.stderr}`);
  }
  // The lowering is validated on the plugin's authoritative transform output —
  // the transformed TypeScript ttsc feeds to the emit stage (and that
  // @ttsc/unplugin/bun consumes directly). Prefer the emitted dist JS when ttsc
  // wrote it; otherwise read the transform envelope ttsc surfaces on stdout.
  try {
    app = readFileSync(join(projDir, "dist", "app.js"), "utf8");
  } catch {
    const envelope = JSON.parse(result.stdout) as { typescript: Record<string, string> };
    app = envelope.typescript["src/app.ts"] ?? "";
  }
}, COLD_BUILD_MS);

describe.skipIf(!toolchainReady)("ttsc/Go nameof lowering byte-parity", () => {
  test("app-internal type → rootless ./path:Symbol token", () => {
    expect(app).toContain(`"./app:ILocal"`);
    expect(app).not.toContain("nameof<");
  });

  test("Promise<T> → honest closed-generic token", () => {
    expect(app).toContain(`"Promise<./app:ILocal>"`);
  });

  test("package-public subpath → importSpecifier:Symbol", () => {
    expect(app).toContain(`"your-lib/contracts:IFoo"`);
  });

  test("root re-export of a deep declaration → bare-package Tier-1 token", () => {
    // The augmentation-token shape: nameof<T>() over an interface re-exported
    // from the package root tokenizes as the bare package, not the nested file.
    expect(app).toContain(`"your-lib:Deep"`);
  });
});
