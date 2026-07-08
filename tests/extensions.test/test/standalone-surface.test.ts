// Snapshot the exported STANDALONE extension surface -- the member-name set of
// each dual-export object literal added by the foreign-class sites (docs §17),
// mirroring #95's token-snapshot approach. A member added or removed here is a
// deliberate, version-bump-gated change, so this test must be updated in the same
// commit that changes the surface.

import { commandLineConfigExtensions } from "@rhombus-std/config.commandline";
import { envConfigExtensions } from "@rhombus-std/config.env";
import { inMemoryConfigExtensions } from "@rhombus-std/config";
import { jsonConfigExtensions } from "@rhombus-std/config.json";
import { memoryCacheManifestExtensions } from "@rhombus-std/caching.memory";
import { diagnosticsExtensions } from "@rhombus-std/diagnostics";
import { loggingExtensions } from "@rhombus-std/logging";
import { optionsExtensions } from "@rhombus-std/options.augmentations";
import { describe, expect, test } from "bun:test";

const keys = (set: object): string[] => Object.keys(set).sort();

describe("standalone extension surface (member-name snapshots)", () => {
  test("config providers", () => {
    expect(keys(jsonConfigExtensions)).toEqual(["addJsonFile"]);
    expect(keys(envConfigExtensions)).toEqual(["addEnvironmentVariables"]);
    expect(keys(commandLineConfigExtensions)).toEqual(["addCommandLine"]);
    expect(keys(inMemoryConfigExtensions)).toEqual(["addInMemoryCollection"]);
  });

  test("ServiceManifest augmentations", () => {
    expect(keys(diagnosticsExtensions)).toEqual(["addMetrics", "addTracing"]);
    expect(keys(loggingExtensions)).toEqual(["addLogging"]);
    expect(keys(memoryCacheManifestExtensions)).toEqual(["addMemoryCache"]);
    expect(keys(optionsExtensions)).toEqual(["addOptions", "configure"]);
  });

  test("every member is a receiver-first function", () => {
    for (
      const set of [
        jsonConfigExtensions,
        envConfigExtensions,
        commandLineConfigExtensions,
        inMemoryConfigExtensions,
        diagnosticsExtensions,
        loggingExtensions,
        memoryCacheManifestExtensions,
        optionsExtensions,
      ]
    ) {
      for (const name of Object.keys(set)) {
        expect((set as Record<string, unknown>)[name]).toBeInstanceOf(Function);
      }
    }
  });
});
