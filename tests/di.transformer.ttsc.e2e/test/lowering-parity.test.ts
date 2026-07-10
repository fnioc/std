import { beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Production-path e2e parity: drives the REAL ttsc (typescript-go toolchain) over
// a temp project that wires the Go registration plugin through the
// `@rhombus-std/di.transformer/ttsc` descriptor, then asserts the emitted JS
// carries the SAME byte-identical token strings and lowered call shapes the
// hand-written TypeScript registration transformer produces (the parity corpus
// lives in tests/di.transformer.test/test/*.test.ts).
//
// The fixture path is STABLE (not mkdtemp) so the project-local ttsc plugin cache
// (node_modules/.cache/ttsc) survives across runs: the first run pays the cold
// ~5-minute Go plugin build, later runs are instant. This suite needs the Go
// toolchain, so it is kept OUT of the default gate (script `test:e2e`) and
// self-skips when go is not resolvable.
//
// Toolchain: ttsc ships its own Go SDK and prefers it, but inherits GOROOT from
// the ambient (mise) environment — a version split there makes the plugin compile
// fail. Pin to one self-consistent toolchain via TTSC_GO_BINARY + GOTOOLCHAIN=local.

const goToolchain = spawnSync("mise", ["which", "go"], { encoding: "utf8" });
const toolchainReady = goToolchain.status === 0 && goToolchain.stdout.trim().length > 0;

const PKG_ROOT = resolve(import.meta.dir, "..");
const REPO_ROOT = resolve(PKG_ROOT, "..", "..");
const TTSC = join(PKG_ROOT, "node_modules", "ttsc", "lib", "launcher", "ttsc.js");
const TS7 = join(PKG_ROOT, "node_modules", "typescript");
const UNPLUGIN = join(PKG_ROOT, "node_modules", "@ttsc", "unplugin");
const DI = join(REPO_ROOT, "libraries", "di.transformer");

const projDir = join(tmpdir(), "fnioc-ttsc-di-e2e");
const COLD_BUILD_MS = 420_000;

function link(target: string, linkPath: string): void {
  try {
    symlinkSync(target, linkPath);
  } catch {
    // Ignore EEXIST from a re-run; link targets are stable.
  }
}

// A home-backed work dir for the plugin's `go build`. The default `$WORK` lands
// in the system TMPDIR, which is a size-capped tmpfs on this host — a cold
// typescript-go compile exhausts it. Redirecting GOTMPDIR onto the (large) home
// filesystem keeps the build off tmpfs.
const goBuildTmp = join(REPO_ROOT, "node_modules", ".cache", "ttsc-di-gobuild");

/** A build env with a single self-consistent Go toolchain (see file header). */
function goEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env } as NodeJS.ProcessEnv;
  delete env.GOROOT;
  delete env.GOBIN;
  env.GOTOOLCHAIN = "local";
  mkdirSync(goBuildTmp, { recursive: true });
  env.GOTMPDIR = goBuildTmp;
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
  link(DI, join(nm, "@rhombus-std", "di.transformer"));

  // A package-public library exporting the service interface through a subpath —
  // exercises the Tier-1 (import-specifier) token in a registration.
  const lib = join(nm, "your-lib");
  mkdirSync(join(lib, "contracts"), { recursive: true });
  writeFileSync(
    join(lib, "package.json"),
    JSON.stringify({
      name: "your-lib",
      version: "3.4.5",
      exports: { ".": "./index.js", "./contracts": "./contracts/index.js" },
    }),
  );
  writeFileSync(join(lib, "index.d.ts"), `export {};\n`);
  writeFileSync(join(lib, "contracts", "index.d.ts"), `export interface IUserRepo {}\n`);

  writeFileSync(join(projDir, "src", "nameof.ts"), `export declare function nameof<T>(): string;\n`);
  writeFileSync(
    join(projDir, "src", "app.ts"),
    `
import { nameof } from "./nameof";
import { IUserRepo } from "your-lib/contracts";

interface ILogger {}
interface IDbConnection {}
class ConsoleLogger implements ILogger {}
class SqlUserRepo implements IUserRepo {
  constructor(log: ILogger, db: IDbConnection, table: string) {}
}

declare const services: {
  add<I>(c: unknown): { as<S extends string>(): void };
};
declare const provider: {
  resolve<I>(): I;
  isService<I>(): boolean;
};

services.add<ILogger>(ConsoleLogger).as<"singleton">();
services.add<IUserRepo>(SqlUserRepo).as<"request">();

export const marker = nameof<IUserRepo>();
export const dep = provider.resolve<ILogger>();
export const known = provider.isService<ILogger>();
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
        plugins: [{ transform: "@rhombus-std/di.transformer/ttsc" }],
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
  // ttsc runs the plugin as a SOURCE-to-source stage: it emits the lowered
  // TypeScript for each file as a stdout envelope (not a written dist/*.js). The
  // production consumer (a bundler via @ttsc/unplugin) then type-strips that
  // source to JS — which is where the type-only scaffolding (`declare const
  // services: { add<I>… }`, interface decls) disappears. Reproduce that final
  // step here so the assertions test the SHIPPED JS, not the intermediate TS:
  // otherwise a retained generic type annotation reads as an un-lowered call.
  let lowered: string;
  try {
    lowered = readFileSync(join(projDir, "dist", "app.js"), "utf8");
  } catch {
    const envelope = JSON.parse(result.stdout) as { typescript: Record<string, string> };
    lowered = envelope.typescript["src/app.ts"] ?? "";
  }
  app = new Bun.Transpiler({ loader: "ts" }).transformSync(lowered);
}, COLD_BUILD_MS);

describe.skipIf(!toolchainReady)("ttsc/Go registration lowering byte-parity", () => {
  test("no type-argument authoring forms survive the lowering", () => {
    expect(app).not.toContain("add<");
    expect(app).not.toContain(".as<");
    expect(app).not.toContain("resolve<");
    expect(app).not.toContain("isService<");
    expect(app).not.toContain("nameof<");
  });

  test("zero-arg class registration → token + empty inline signature + scope", () => {
    // services.add<ILogger>(ConsoleLogger).as<"singleton">()
    expect(app).toContain(`"./app:ILogger"`);
    expect(app).toContain("ConsoleLogger");
    expect(app).toContain(`.as("singleton")`);
  });

  test("multi-param ctor → package-public service token + inline dep signature (Rule 1)", () => {
    // The service token is the Tier-1 import specifier; the ctor deps are the
    // app-internal interface tokens and the bare intrinsic "string" (Rule 1).
    expect(app).toContain(`"your-lib/contracts:IUserRepo"`);
    expect(app).toContain(`"./app:IDbConnection"`);
    expect(app).toContain(`"string"`);
    expect(app).toContain(`.as("request")`);
  });

  test("nameof<T>() → the same byte-identical package-public token", () => {
    expect(app).toContain(`marker = "your-lib/contracts:IUserRepo"`);
  });

  test("tokenless resolve<I>() → resolve(\"<token>\")", () => {
    expect(app).toContain(`resolve("./app:ILogger")`);
  });

  test("tokenless isService<I>() → isService(\"<token>\")", () => {
    expect(app).toContain(`isService("./app:ILogger")`);
  });
});
