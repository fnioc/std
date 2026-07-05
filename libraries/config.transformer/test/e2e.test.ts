import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Production-path e2e: drives the REAL `tspc` (ts-patch's patched compiler) over
// a temp project that imports `@rhombus-std/config.transformer` as a ts-patch plugin, then
// asserts the emitted ESM lowered `.withType<T>()` to `.withSchema({...})` AND
// that running it coerces config against the generated runtime schema.
//
// This is the authoritative check that the installed ts-patch <-> TypeScript pair
// works end-to-end (not just the in-memory harness). Tested pair: the package's
// pinned `ts-patch@^3.3.0` against the repo's `typescript@^5.9`.

const PKG_ROOT = resolve(import.meta.dir, "..");
const REPO_ROOT = resolve(PKG_ROOT, "..", "..");
const TSPC = join(PKG_ROOT, "node_modules", "ts-patch", "bin", "tspc.js");

let projDir: string;

function link(target: string, linkPath: string): void {
  try {
    symlinkSync(target, linkPath);
  } catch {
    // Ignore EEXIST from a re-run; the link target is stable.
  }
}

beforeAll(() => {
  projDir = mkdtempSync(join(tmpdir(), "config-tsp-e2e-"));
  const nm = join(projDir, "node_modules");
  mkdirSync(join(nm, "@rhombus-std"), { recursive: true });
  mkdirSync(join(projDir, "src"), { recursive: true });

  // Wire the temp project's node_modules to the real packages + tools.
  link(join(REPO_ROOT, "node_modules", "typescript"), join(nm, "typescript"));
  link(join(PKG_ROOT, "node_modules", "ts-patch"), join(nm, "ts-patch"));
  link(PKG_ROOT, join(nm, "@rhombus-std", "config.transformer"));
  link(join(REPO_ROOT, "libraries", "config"), join(nm, "@rhombus-std", "config"));
  link(join(REPO_ROOT, "libraries", "config.core"), join(nm, "@rhombus-std", "config.core"));

  writeFileSync(
    join(projDir, "src", "config.ts"),
    `export interface ServerConfig {
  host: string;
  port: number;
  ssl?: boolean;
}
`,
  );
  writeFileSync(
    join(projDir, "src", "main.ts"),
    `import { ConfigurationBuilder } from "@rhombus-std/config";
import "@rhombus-std/config/with-type-augment";
import type { ServerConfig } from "./config.js";

const config = new ConfigurationBuilder()
  .addInMemoryCollection({ host: "example.com", port: "8443", ssl: "true" })
  .withType<ServerConfig>()
  .build();

console.log(JSON.stringify(config));
`,
  );
  writeFileSync(
    join(projDir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        strict: true,
        outDir: "dist",
        rootDir: "src",
        skipLibCheck: true,
        noEmitOnError: false,
        plugins: [{ transform: "@rhombus-std/config.transformer", import: "transform" }],
      },
      include: ["src/**/*"],
    }),
  );
  // Mark the temp project ESM so `node dist/main.js` runs the emitted ESM.
  writeFileSync(
    join(projDir, "package.json"),
    JSON.stringify({ name: "config-e2e-fixture", private: true, type: "module" }),
  );
});

afterAll(() => {
  if (projDir) {
    rmSync(projDir, { recursive: true, force: true });
  }
});

describe("ts-patch production e2e (ESM)", () => {
  test("tspc compiles and emits the lowered .withSchema contract", () => {
    const result = spawnSync("node", [TSPC, "-p", "tsconfig.json"], {
      cwd: projDir,
      encoding: "utf8",
    });
    // tspc should run cleanly (status 0); surface its output if not.
    expect(result.status, result.stdout + result.stderr).toBe(0);

    const emitted = readFileSync(join(projDir, "dist", "main.js"), "utf8");

    // The authored `.withType<ServerConfig>()` is gone, replaced by a generated
    // `.withSchema({...})` runtime schema literal.
    expect(emitted).not.toContain(".withType(");
    expect(emitted).not.toContain(".withType<");
    expect(emitted).toContain(".withSchema(");
    expect(emitted).toContain(`host: "string"`);
    expect(emitted).toContain(`port: "number"`);
    // Optional field wrapper + injected OPTIONAL import.
    expect(emitted).toContain(`import { OPTIONAL } from "@rhombus-std/config"`);
    expect(emitted).toContain(`[OPTIONAL]: "boolean"`);
  }, 30_000);

  test("the emitted program runs and coerces against the generated schema", () => {
    const compile = spawnSync("node", [TSPC, "-p", "tsconfig.json"], {
      cwd: projDir,
      encoding: "utf8",
    });
    expect(compile.status, compile.stdout + compile.stderr).toBe(0);

    const run = spawnSync("node", [join(projDir, "dist", "main.js")], {
      cwd: projDir,
      encoding: "utf8",
    });
    expect(run.status, run.stdout + run.stderr).toBe(0);
    // port is a NUMBER and ssl a BOOLEAN -- proof of runtime-schema-driven
    // coercion end-to-end (the in-memory source stored them as strings).
    expect(run.stdout.trim()).toBe(`{"host":"example.com","port":8443,"ssl":true}`);
  }, 30_000);
});
