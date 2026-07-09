// White-box unit tests for the ProgramService — the LanguageService-backed
// shared Program the unified plugin drives every transform through. Reached via
// the `@rhombus-std/unplugin/internal/*` seam (source), so no dist build is
// needed to exercise these.
//
// Fixtures are hermetic: they declare their own `nameof` / `services` shapes
// inline, so the ProgramService needs only a minimal on-disk tsconfig — no
// node_modules, no di.core resolution.

import { createProgramService } from "@rhombus-std/unplugin/internal/program-service";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let projDir: string;
let tsconfigPath: string;
let appPath: string;

// A registration + nameof fixture the `di` and `nameof` transforms both act on.
const APP_V1 = `
declare function nameof<T>(): string;
interface IProbe {}
class ProbeImpl implements IProbe {}
declare const services: {
  add<I>(c: new (...a: any[]) => I): { as<S extends string>(): void };
};
services.add<IProbe>(ProbeImpl).as<"singleton">();
export const key = nameof<IProbe>();
`;

const APP_V2 = APP_V1 + "\nexport const touched = true;\n";

beforeAll(() => {
  projDir = mkdtempSync(join(tmpdir(), "fnioc-unplugin-ps-"));
  mkdirSync(join(projDir, "src"), { recursive: true });
  appPath = join(projDir, "src", "app.ts");
  writeFileSync(appPath, APP_V1);
  tsconfigPath = join(projDir, "tsconfig.json");
  writeFileSync(
    tsconfigPath,
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        strict: true,
        skipLibCheck: true,
        noEmitOnError: false,
        types: [],
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

describe("ProgramService overlay + versioning", () => {
  test("an overlay is created on first transform and its version bumps only on real change", () => {
    const service = createProgramService({ tsconfigPath });

    // No overlay yet → version 0.
    expect(service.__scriptVersion(appPath)).toBe(0);

    service.transformFile(appPath, APP_V1, ["nameof"]);
    expect(service.__scriptVersion(appPath)).toBe(1);

    // Identical code → no bump (snapshot reused).
    service.transformFile(appPath, APP_V1, ["nameof"]);
    expect(service.__scriptVersion(appPath)).toBe(1);

    // Changed code → bump.
    service.transformFile(appPath, APP_V2, ["nameof"]);
    expect(service.__scriptVersion(appPath)).toBe(2);
  });

  test("nameof<T>() lowers to a derived string token in the output", () => {
    const service = createProgramService({ tsconfigPath });
    const result = service.transformFile(appPath, APP_V1, ["nameof"]);
    // The `nameof<IProbe>()` CALL became its derived string token; the leftover
    // `nameof<` is only the `declare function` signature, never a call.
    expect(result.text).not.toContain("nameof<IProbe>()");
    expect(result.text).toContain("\"./app:IProbe\"");
  });
});

describe("ProgramService on-demand root files", () => {
  test("a file outside the tsconfig include is added to the Program on demand", () => {
    const service = createProgramService({ tsconfigPath });
    // Not matched by `include: ["src/**/*"]` and never written to disk.
    const outsidePath = join(projDir, "outside", "extra.ts");

    expect(service.__hasSourceFile(outsidePath)).toBe(false);

    const result = service.transformFile(outsidePath, APP_V1, ["nameof"]);
    expect(result.text).toContain("IProbe");

    // Now resolvable into the Program.
    expect(service.__hasSourceFile(outsidePath)).toBe(true);
  });
});

describe("ProgramService factory cache", () => {
  test("factories are cached per Program and rebuilt when the Program changes", () => {
    const service = createProgramService({ tsconfigPath });
    expect(service.__factoryBuildCount()).toBe(0);

    // First pass builds both active factories against Program P1.
    service.transformFile(appPath, APP_V1, ["di", "nameof"]);
    expect(service.__factoryBuildCount()).toBe(2);

    // Same code → same Program → cache hit, no rebuild.
    service.transformFile(appPath, APP_V1, ["di", "nameof"]);
    expect(service.__factoryBuildCount()).toBe(2);

    // Changed code → new Program instance → both factories rebuilt.
    service.transformFile(appPath, APP_V2, ["di", "nameof"]);
    expect(service.__factoryBuildCount()).toBe(4);
  });
});
