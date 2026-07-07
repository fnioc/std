// With-transformer integration: the type-driven `addOptions<T>()` sugar,
// compiled by tspc with both plugins, lowers to the explicit verb and — run
// against the real di engine + options augmentation — resolves an `Options<T>`
// that wraps the T bound at its own token.
//
// The wrapper token the satellite emits (`@rhombus-std/options:Options<token(T)>`)
// and the token `resolve<Options<T>>()` derives must AGREE, and the element token
// the satellite emits must match the token `addValue<T>()` registered T at — the
// whole point of deriving both through di.transformer's shared machinery. A
// mismatch would surface here as an unregistered-token throw.

import { afterEach, expect, test } from "bun:test";
import { type CompiledProject, compileWithTransformer } from "./harness";

// Registrations are at module scope: di.transformer lowers registration
// statements at TOP LEVEL only (a nested `resolve<T>()` still lowers anywhere).
const SAMPLE = `
import { ServiceManifest } from "@rhombus-std/di";
import type { Options } from "@rhombus-std/options";
import "@rhombus-std/options.augmentations";

interface AppOptions {
  host: string;
  port: number;
}

const base: AppOptions = { host: "localhost", port: 8080 };
const services = new ServiceManifest<"singleton">();
services.addValue<AppOptions>(base);
services.addOptions<AppOptions>().as("singleton");
const provider = services.build().createScope("singleton");

export function run() {
  const options = provider.resolve<Options<AppOptions>>();
  return { value: options.value, sameInstance: options.value === base };
}
`;

let project: CompiledProject | undefined;

afterEach(() => {
  project?.cleanup();
  project = undefined;
});

test("addOptions<T>() lowers, and the wrapper resolves an Options<T> over the bound T", async () => {
  project = compileWithTransformer({ "app.ts": SAMPLE });

  // The sugar lowered to the explicit two-token verb; the wrapper is the closed
  // Options<> token, the element the plain AppOptions token.
  const emitted = project.emitted("app.js");
  expect(emitted).toMatch(
    /addOptions\(\s*"@rhombus-std\/options:Options<[^"]*AppOptions>"\s*,\s*"[^"]*AppOptions"\s*\)/,
  );
  expect(emitted).not.toContain("addOptions<");

  const mod = await project.load("app");
  const run = mod.run as () => {
    value: { host: string; port: number };
    sameInstance: boolean;
  };
  const result = run();

  expect(result.value).toEqual({ host: "localhost", port: 8080 });
  expect(result.sameInstance).toBe(true);
}, 60_000); // tspc compiles a real program (pulling the options + config sources);
// generous timeout so it survives parallel-suite contention.
