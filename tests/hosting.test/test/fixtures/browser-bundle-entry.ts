// Fixture entry for the browser-bundle smoke test. Imports the public hosting
// surface and constructs the empty (defaults-disabled) builder -- the
// browser-safe path -- so `Bun.build({ target: "browser" })` exercises the
// package's real static-import graph and fails on any `node:*` specifier.
import { Host } from '@rhombus-std/hosting';

export function makeBrowserBuilder() {
  return Host.createEmptyApplicationBuilder({ disableDefaults: true });
}
