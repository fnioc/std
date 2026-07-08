// Snapshot the exported STANDALONE augmentation surface -- the member-name set of
// each named object literal added by the foreign-class sites (docs §28),
// mirroring #95's token-snapshot approach. A member added or removed here is a
// deliberate, version-bump-gated change, so this test must be updated in the same
// commit that changes the surface.

import { MemoryCacheServiceCollectionExtensions } from "@rhombus-std/caching.memory";
import { MemoryConfigurationBuilderExtensions } from "@rhombus-std/config";
import { CommandLineConfigurationExtensions } from "@rhombus-std/config.commandline";
import { EnvironmentVariablesExtensions } from "@rhombus-std/config.env";
import { JsonConfigurationExtensions } from "@rhombus-std/config.json";
import { MetricsServiceExtensions, TracingServiceExtensions } from "@rhombus-std/diagnostics";
import { MetricsOptionsExtensions, TracingOptionsExtensions } from "@rhombus-std/diagnostics.core";
import { LoggerFilterOptionsExtensions, LoggingServiceCollectionExtensions } from "@rhombus-std/logging";
import {
  OptionsConfigurationServiceCollectionExtensions,
  OptionsServiceCollectionExtensions,
} from "@rhombus-std/options.augmentations";
import { describe, expect, test } from "bun:test";

const keys = (set: object): string[] => Object.keys(set).sort();

describe("standalone augmentation surface (member-name snapshots)", () => {
  test("config providers", () => {
    expect(keys(JsonConfigurationExtensions)).toEqual(["addJsonFile"]);
    expect(keys(EnvironmentVariablesExtensions)).toEqual(["addEnvironmentVariables"]);
    expect(keys(CommandLineConfigurationExtensions)).toEqual(["addCommandLine"]);
    expect(keys(MemoryConfigurationBuilderExtensions)).toEqual(["addInMemoryCollection"]);
  });

  test("ServiceManifest augmentations", () => {
    expect(keys(MetricsServiceExtensions)).toEqual(["addMetrics"]);
    expect(keys(TracingServiceExtensions)).toEqual(["addTracing"]);
    expect(keys(LoggingServiceCollectionExtensions)).toEqual(["addLogging"]);
    expect(keys(MemoryCacheServiceCollectionExtensions)).toEqual(["addMemoryCache"]);
    expect(keys(OptionsServiceCollectionExtensions)).toEqual(["addOptions"]);
    expect(keys(OptionsConfigurationServiceCollectionExtensions)).toEqual(["configure"]);
  });

  test("value-object augmentations (§29/#105)", () => {
    expect(keys(LoggerFilterOptionsExtensions)).toEqual(["addFilter"]);
    expect(keys(MetricsOptionsExtensions)).toEqual(["disableMetrics", "enableMetrics"]);
    expect(keys(TracingOptionsExtensions)).toEqual(["disableTracing", "enableTracing"]);
  });

  test("every member is a receiver-first function", () => {
    for (
      const set of [
        JsonConfigurationExtensions,
        EnvironmentVariablesExtensions,
        CommandLineConfigurationExtensions,
        MemoryConfigurationBuilderExtensions,
        MetricsServiceExtensions,
        TracingServiceExtensions,
        LoggingServiceCollectionExtensions,
        MemoryCacheServiceCollectionExtensions,
        OptionsServiceCollectionExtensions,
        OptionsConfigurationServiceCollectionExtensions,
        LoggerFilterOptionsExtensions,
        MetricsOptionsExtensions,
        TracingOptionsExtensions,
      ]
    ) {
      for (const name of Object.keys(set)) {
        expect((set as Record<string, unknown>)[name]).toBeInstanceOf(Function);
      }
    }
  });
});
