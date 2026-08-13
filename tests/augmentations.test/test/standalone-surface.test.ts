// Snapshot the exported STANDALONE augmentation surface -- the member-name set of
// each named object literal added by the foreign-class sites (docs §28),
// mirroring #95's token-snapshot approach. A member added or removed here is a
// deliberate, version-bump-gated change, so this test must be updated in the same
// commit that changes the surface.

import { ServiceManifestMemoryCacheAugmentations } from '@rhombus-std/caching.memory';
import { MemoryConfigBuilderAugmentations } from '@rhombus-std/config';
import { ConfigBuilderCommandLineAugmentations } from '@rhombus-std/config.commandline';
import { ConfigBuilderEnvAugmentations } from '@rhombus-std/config.env';
import { ConfigBuilderJsonAugmentations } from '@rhombus-std/config.json';
import { ServiceManifestMetricsAugmentations, ServiceManifestTracingAugmentations } from '@rhombus-std/diagnostics';
import { MetricsOptionsAugmentations, TracingOptionsAugmentations } from '@rhombus-std/diagnostics.core';
import { LoggerFilterOptionsExtensions, ServiceManifestLoggingAugmentations } from '@rhombus-std/logging';
import { ServiceManifestOptionsAugmentations,
  ServiceManifestOptionsConfigAugmentations } from '@rhombus-std/options.augmentations';
import { describe, expect, test } from 'bun:test';

const keys = (set: object): string[] => Object.keys(set).sort();

describe('standalone augmentation surface (member-name snapshots)', () => {
  test('config providers', () => {
    expect(keys(ConfigBuilderJsonAugmentations)).toEqual(['addJsonFile', 'addJsonStream']);
    expect(keys(ConfigBuilderEnvAugmentations)).toEqual(['addEnvironmentVariables']);
    expect(keys(ConfigBuilderCommandLineAugmentations)).toEqual(['addCommandLine']);
    expect(keys(MemoryConfigBuilderAugmentations)).toEqual(['addInMemoryCollection']);
  });

  test('Manifest augmentations', () => {
    expect(keys(ServiceManifestMetricsAugmentations)).toEqual(['addMetrics']);
    expect(keys(ServiceManifestTracingAugmentations)).toEqual(['addTracing']);
    expect(keys(ServiceManifestLoggingAugmentations)).toEqual(['addLogging']);
    expect(keys(ServiceManifestMemoryCacheAugmentations)).toEqual(['addDistributedMemoryCache', 'addMemoryCache']);
    expect(keys(ServiceManifestOptionsAugmentations)).toEqual(['addOptions', 'postConfigure', 'validate']);
    expect(keys(ServiceManifestOptionsConfigAugmentations)).toEqual(['configure']);
  });

  test('value-object augmentations (§29/#105)', () => {
    expect(keys(LoggerFilterOptionsExtensions)).toEqual(['addFilter']);
    expect(keys(MetricsOptionsAugmentations)).toEqual(['disableMetrics', 'enableMetrics']);
    expect(keys(TracingOptionsAugmentations)).toEqual(['disableTracing', 'enableTracing']);
  });

  test('every member is a receiver-first function', () => {
    for (const set of [ConfigBuilderJsonAugmentations, ConfigBuilderEnvAugmentations,
      ConfigBuilderCommandLineAugmentations, MemoryConfigBuilderAugmentations, ServiceManifestMetricsAugmentations,
      ServiceManifestTracingAugmentations, ServiceManifestLoggingAugmentations, ServiceManifestMemoryCacheAugmentations,
      ServiceManifestOptionsAugmentations, ServiceManifestOptionsConfigAugmentations, LoggerFilterOptionsExtensions,
      MetricsOptionsAugmentations, TracingOptionsAugmentations]) {
      for (const name of Object.keys(set)) {
        expect((set as Record<string, unknown>)[name]).toBeInstanceOf(Function);
      }
    }
  });
});
