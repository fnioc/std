// Browser-bundle smoke test: @rhombus-std/hosting must bundle for a browser
// target. Both cases bundle the built `dist` -- what a real published browser
// consumer resolves, and consistent with the rest of this suite, which already
// requires a built workspace (it reaches hosting through the `internal/*` ->
// `dist/internal` subpath). Run `bun run build` first.
//
// The bundle runs in a SUBPROCESS (`bun build ... --target browser`) rather
// than in-process `Bun.build`: the bundler cannot re-read a module that the
// test runner has already loaded into this process's registry (it throws
// "Unexpected reading file"), and sibling tests in this suite load the whole
// hosting graph. A subprocess has a clean registry, so the check is
// order-independent.
//
// Divergence from the browser-hosting memo, noted against current source: a
// whole-graph bundle of the public entry is NOT a clean regression guard for
// hosting's own `node:*` surface, because `default-configuration.ts` still
// statically imports `@rhombus-std/config.json` (which imports `node:fs` /
// `node:path`) and `logging` re-exports the `node:async_hooks`-backed
// `LoggerExternalScopeProvider`. Bun's browser target polyfills `node:path`
// and stubs `node:fs` / `node:async_hooks` to empty modules, so the public
// entry bundles successfully regardless -- retiring those imports belongs to
// the config.json / logging stages, not this one. The second case bundles
// hosting's composition tail in isolation (`dist/internal/host-composition.js`,
// which imports neither config.json nor anything node-backed once the
// `node:path` import is gone) so it fails if a `node:*` import is
// re-introduced into hosting itself.

import { expect, test } from "bun:test";

const fixture = import.meta.dir + "/fixtures/browser-bundle-entry.ts";
const compositionTail = import.meta.dir + "/../../../libraries/hosting/dist/internal/host-composition.js";

function bundleForBrowser(entrypoint: string): { exitCode: number; bundle: string; stderr: string } {
  const result = Bun.spawnSync(["bun", "build", entrypoint, "--target", "browser"]);
  return {
    exitCode: result.exitCode,
    bundle: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

test("hosting bundles for a browser target via the empty (defaults-disabled) builder path", () => {
  const result = bundleForBrowser(fixture);

  expect(result.stderr).toBe("");
  expect(result.exitCode).toBe(0);
});

test("the hosting composition tail carries no node:* import (browser regression guard)", () => {
  const result = bundleForBrowser(compositionTail);

  expect(result.exitCode).toBe(0);

  const nodeSpecifiers = [...new Set([...result.bundle.matchAll(/node:[a-z_]+/g)].map((match) => match[0]))];
  expect(nodeSpecifiers).toEqual([]);
});

test("the hosting composition tail SOURCE imports no node:* builtin (catches stubbed builtins too)", async () => {
  // The bundle grep above only catches builtins whose specifier SURVIVES the
  // bundle -- bun's browser target polyfills node:path (specifier survives) but
  // STUBS node:fs / node:async_hooks to empty modules (specifier vanishes), so
  // a bundle-only check would miss a re-introduced `import ... from "node:fs"`.
  // A source-level grep of the composition tail's own emit catches every
  // flavor: no direct node:* import belongs in host-composition.
  const source = await Bun.file(compositionTail).text();
  const imports = [...source.matchAll(/(?:from|import|require\()\s*["']node:[a-z_/]+["']/g)].map((match) => match[0]);
  expect(imports).toEqual([]);
});
