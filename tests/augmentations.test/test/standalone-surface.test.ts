// Snapshot the exported STANDALONE augmentation surface -- the member-name set of
// each named object literal added by the foreign-class sites (docs §28),
// mirroring #95's token-snapshot approach. A member added or removed here is a
// deliberate, version-bump-gated change, so this test must be updated in the same
// commit that changes the surface.

import { MemoryCacheServiceCollectionExtensions } from '@rhombus-std/caching.memory';
import { MemoryConfigBuilderExtensions } from '@rhombus-std/config';
import { CommandLineConfigAugmentations } from '@rhombus-std/config.commandline';
import { EnvironmentVariablesExtensions } from '@rhombus-std/config.env';
import { JsonConfigAugmentations } from '@rhombus-std/config.json';
import { MetricsServiceExtensions, TracingServiceExtensions } from '@rhombus-std/diagnostics';
import { MetricsOptionsExtensions, TracingOptionsExtensions } from '@rhombus-std/diagnostics.core';
import { LoggerFilterOptionsExtensions, LoggingServiceCollectionExtensions } from '@rhombus-std/logging';
import { OptionsConfigServiceCollectionExtensions,
  OptionsServiceCollectionExtensions } from '@rhombus-std/options.augmentations';
import { describe, expect, test } from 'bun:test';

const keys = (set: object): string[] => Object.keys(set).sort();

describe('standalone augmentation surface (member-name snapshots)', () => {
  test('config providers', () => {
    expect(keys(JsonConfigAugmentations)).toEqual(['addJsonFile', 'addJsonStream']);
    expect(keys(EnvironmentVariablesExtensions)).toEqual(['addEnvironmentVariables']);
    expect(keys(CommandLineConfigAugmentations)).toEqual(['addCommandLine']);
    expect(keys(MemoryConfigBuilderExtensions)).toEqual(['addInMemoryCollection']);
  });

  test('IServiceManifest augmentations', () => {
    expect(keys(MetricsServiceExtensions)).toEqual(['addMetrics']);
    expect(keys(TracingServiceExtensions)).toEqual(['addTracing']);
    expect(keys(LoggingServiceCollectionExtensions)).toEqual(['addLogging']);
    expect(keys(MemoryCacheServiceCollectionExtensions)).toEqual(['addDistributedMemoryCache', 'addMemoryCache']);
    expect(keys(OptionsServiceCollectionExtensions)).toEqual(['addOptions', 'postConfigure', 'validate']);
    expect(keys(OptionsConfigServiceCollectionExtensions)).toEqual(['configure']);
  });

  test('value-object augmentations (§29/#105)', () => {
    expect(keys(LoggerFilterOptionsExtensions)).toEqual(['addFilter']);
    expect(keys(MetricsOptionsExtensions)).toEqual(['disableMetrics', 'enableMetrics']);
    expect(keys(TracingOptionsExtensions)).toEqual(['disableTracing', 'enableTracing']);
  });

  test('every member is a receiver-first function', () => {
    for (
      const set of [
        JsonConfigAugmentations,
        EnvironmentVariablesExtensions,
        CommandLineConfigAugmentations,
        MemoryConfigBuilderExtensions,
        MetricsServiceExtensions,
        TracingServiceExtensions,
        LoggingServiceCollectionExtensions,
        MemoryCacheServiceCollectionExtensions,
        OptionsServiceCollectionExtensions,
        OptionsConfigServiceCollectionExtensions,
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
