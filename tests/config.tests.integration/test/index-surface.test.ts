// Public-surface smoke test for the pieces that only exist ACROSS the package
// split -- run against the BUILT DIST (node resolves each @rhombus-std/config.* import to
// dist/index.js; see this package's test script). libraries/config's own
// index.test.ts already covers the core barrel in source mode; this file
// covers what that one structurally cannot:
//
//   1. each provider package exports its Source/Provider runtime symbols,
//   2. the three external-provider add* augmentations are actually installed on
//      the SAME ConfigurationBuilder the consumer imports (they survived
//      bundling with @rhombus-std/config kept external, and the `declare module`
//      survived rollup-plugin-dts), and
//   3. the Tier 2 with-type-augment subpath ships its throwing stub in dist and
//      throws under node -- the published-mode behavior a source-mode bun test
//      can't observe.

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { ConfigurationBuilder } from "@rhombus-std/config";
import {
  CommandLineConfigurationProvider,
  CommandLineConfigurationSource,
  type CommandLineConfigurationSourceOptions,
} from "@rhombus-std/config.commandline";
import {
  defaultVariableNameTransformation,
  EnvironmentVariablesConfigurationProvider,
  EnvironmentVariablesConfigurationSource,
  type EnvironmentVariablesConfigurationSourceOptions,
} from "@rhombus-std/config.env";
import {
  JsonConfigurationProvider,
  JsonConfigurationSource,
  type JsonConfigurationSourceOptions,
} from "@rhombus-std/config.json";

describe("cross-package public surface (built dist)", () => {
  test("each provider package exports its Source and Provider runtime bindings", () => {
    assert.equal(typeof JsonConfigurationSource, "function");
    assert.equal(typeof JsonConfigurationProvider, "function");
    assert.equal(typeof EnvironmentVariablesConfigurationSource, "function");
    assert.equal(typeof EnvironmentVariablesConfigurationProvider, "function");
    assert.equal(typeof defaultVariableNameTransformation, "function");
    assert.equal(typeof CommandLineConfigurationSource, "function");
    assert.equal(typeof CommandLineConfigurationProvider, "function");
  });

  test("the add* augmentations are installed on ConfigurationBuilder's prototype", () => {
    const builder = new ConfigurationBuilder();
    assert.equal(typeof builder.addJsonFile, "function");
    assert.equal(typeof builder.addEnvironmentVariables, "function");
    assert.equal(typeof builder.addCommandLine, "function");
  });

  test("withSchema(...).build() coerces through the command-line provider, and the generic threads", () => {
    const config: { readonly Host: string; readonly Port: number } = new ConfigurationBuilder()
      .addCommandLine(["--Host=localhost", "--Port=8080"])
      .withSchema({ Host: "string", Port: "number" })
      .build();

    assert.deepEqual(config, { Host: "localhost", Port: 8080 });
    // Compile-time: the builder threads the generic so `Port` is a `number`.
    const port: number = config.Port;
    assert.equal(port, 8080);
  });

  test("the with-type-augment subpath ships its throwing stub in dist and throws under node", async () => {
    await import("@rhombus-std/config/with-type-augment");
    const builder = new ConfigurationBuilder();
    assert.equal(typeof builder.withType, "function");
    assert.throws(() => builder.withType(), /@rhombus-std\/config.transformer/);
  });

  test("provider option types are usable in a type position", () => {
    type _Json = JsonConfigurationSourceOptions;
    type _Env = EnvironmentVariablesConfigurationSourceOptions;
    type _Cli = CommandLineConfigurationSourceOptions;
    const _optional: _Json = { optional: true };
    const _prefix: _Env = { prefix: "APP_" };
    const _mappings: _Cli = { switchMappings: { "-h": "Host" } };
    assert.equal(_optional.optional, true);
    assert.equal(_prefix.prefix, "APP_");
    assert.deepEqual(_mappings.switchMappings, { "-h": "Host" });
  });
});
