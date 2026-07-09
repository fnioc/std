// Production-path e2e for @rhombus-std/unplugin: drives an in-process
// `Bun.build` with our plugin's BUN adapter over a temp project that authors the
// tokenless di dialect, then asserts three things:
//
//   1. the sugar (`add<I>(C).as<"x">()`, `resolve<I>()`) LOWERS to derived
//      string tokens in the emitted bundle;
//   2. the bundle RUNS and behaves — the real `@rhombus-std/di` runtime resolves
//      the service through the lowered tokens (dynamic import, observable value);
//   3. a diagnostic-triggering fixture surfaces the transformer's `ts.Diagnostic`
//      as a hard build error.
//
// This proves tspc-EQUIVALENCE at the behavior level (same fixture semantics
// under the unplugin/Bun pipeline as under tspc) — byte-equivalence of emitted
// JS is NOT required.
//
// The temp project resolves `@rhombus-std/*` by symlinking its `node_modules` to
// THIS test package's `node_modules` (whose devDeps pull the whole di runtime
// graph). `Bun.build` resolves each workspace dep to its built `dist/*.js`, so
// only the fixture's own `.ts` flows through the transform.

import { unplugin } from "@rhombus-std/unplugin";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const PKG_ROOT = resolve(import.meta.dir, "..");

let projDir: string;
let tsconfigPath: string;

const MAIN_SRC = `
import { ServiceManifest } from "@rhombus-std/di";

export interface IProbe {
  value(): number;
}
export class ProbeImpl implements IProbe {
  value(): number {
    return 42;
  }
}

const services = new ServiceManifest<"singleton">();
services.add<IProbe>(ProbeImpl).as<"singleton">();
const provider = services.build();
const probe = provider.resolve<IProbe>();
export const result = probe.value();
`;

// The one remaining hard UnderivableToken case: an anonymous inline structural
// ctor param has no name → no token → error TS990006.
const BAD_SRC = `
export interface IMarker {}
export class Anon implements IMarker {
  constructor(a: { x: number }) {}
}
declare const services: {
  add<I>(c: new (...a: any[]) => I): { as<S extends string>(): void };
};
services.add<IMarker>(Anon).as<"singleton">();
`;

beforeAll(() => {
  projDir = mkdtempSync(join(tmpdir(), "fnioc-unplugin-e2e-"));
  mkdirSync(join(projDir, "src"), { recursive: true });
  // Give the temp project the test package's resolved dependency graph.
  symlinkSync(join(PKG_ROOT, "node_modules"), join(projDir, "node_modules"));

  writeFileSync(join(projDir, "src", "main.ts"), MAIN_SRC);
  writeFileSync(join(projDir, "src", "bad.ts"), BAD_SRC);

  tsconfigPath = join(projDir, "tsconfig.json");
  writeFileSync(
    tsconfigPath,
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        lib: ["ES2022", "ESNext.Disposable"],
        strict: true,
        skipLibCheck: true,
        noEmitOnError: false,
        // Reproduce the real consumer wiring: di.core resolves to its BUILT
        // types (skip-lib-checked) and the di.transformer authoring augmentation
        // enters the Program — inherited by the plugin's shared Program, never
        // hand-assembled.
        customConditions: ["built"],
        types: ["@rhombus-std/di.transformer"],
      },
      include: ["src/**/*"],
    }),
  );
});

afterAll(() => {
  if (projDir) {
    rmSync(projDir, { recursive: true, force: true });
  }
});

describe("unplugin Bun adapter e2e", () => {
  test("sugar lowers to derived tokens and the bundle runs against the real di runtime", async () => {
    const outdir = join(projDir, "dist");
    const result = await Bun.build({
      entrypoints: [join(projDir, "src", "main.ts")],
      outdir,
      target: "bun",
      format: "esm",
      plugins: [unplugin.bun({ tsconfig: tsconfigPath })],
      throw: false,
    });
    const logText = result.logs.map((log) => String(log)).join("\n");
    expect(result.success, logText).toBe(true);

    const entry = result.outputs.find((output) => output.kind === "entry-point");
    expect(entry).toBeDefined();
    const emitted = await entry!.text();

    // Registration + resolution both lowered to the SAME derived token, and the
    // fixture's authoring type-argument forms are gone. (Assertions are scoped to
    // OUR fixture's identifiers — the bundled di runtime's own text legitimately
    // contains `add<`/`resolve<` in comments/messages.)
    expect(emitted).toContain("services.add(\"./main:IProbe\", ProbeImpl");
    expect(emitted).toContain("provider.resolve(\"./main:IProbe\")");
    expect(emitted).not.toContain("add<IProbe>");
    expect(emitted).not.toContain(".as<\"singleton\">");

    // The bundle RUNS: the di container resolves ProbeImpl through the lowered
    // token and its behavior is observable.
    const module = (await import(entry!.path)) as { result: number };
    expect(module.result).toBe(42);
  }, 30_000);

  test("a transformer diagnostic surfaces as a hard build error", async () => {
    const result = await Bun.build({
      entrypoints: [join(projDir, "src", "bad.ts")],
      target: "bun",
      format: "esm",
      plugins: [unplugin.bun({ tsconfig: tsconfigPath })],
      throw: false,
    });

    expect(result.success).toBe(false);
    const logText = result.logs.map((log) => String(log)).join("\n");
    // The di.transformer UnderivableToken diagnostic (990006) rode out through
    // `this.error` and aborted the build.
    expect(logText).toContain("990006");
  }, 30_000);
});
