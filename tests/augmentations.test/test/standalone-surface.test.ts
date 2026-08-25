// Snapshot the exported STANDALONE augmentation surface -- the member-name set of
// each named object literal added by the foreign-class sites (docs §28),
// mirroring #95's token-snapshot approach. A member added or removed here is a
// deliberate, version-bump-gated change, so this test must be updated in the same
// commit that changes the surface.
//
// The Manifest-receiver augmentation sets that published a registration
// (addMetrics/addTracing/addLogging/addMemoryCache/addDistributedMemoryCache/
// configure) are gone: each now returns its own manifest for a caller to merge
// in with addMany, rather than extending a receiver, so there is no standalone
// object left to snapshot for them. addOptions is the one Manifest-receiver
// member that survived as an installed verb (di.extras.options's addOptions<T>()
// sugar lowers straight to it), so it is the only entry the "Manifest
// augmentations" case below still carries.

import { MemoryConfigBuilderAugmentations } from '@rhombus-std/config';
import { ConfigBuilderCommandLineAugmentations } from '@rhombus-std/config.commandline';
import { ConfigBuilderEnvAugmentations } from '@rhombus-std/config.env';
import { ConfigBuilderJsonAugmentations } from '@rhombus-std/config.json';
import { MetricsOptionsAugmentations, TracingOptionsAugmentations } from '@rhombus-std/diagnostics.core';
import { LoggerFilterOptionsExtensions } from '@rhombus-std/logging';
import { ServiceManifestOptionsAugmentations } from '@rhombus-std/options.augmentations';
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
    expect(keys(ServiceManifestOptionsAugmentations)).toEqual(['addOptions']);
  });

  test('value-object augmentations (§29/#105)', () => {
    expect(keys(LoggerFilterOptionsExtensions)).toEqual(['addFilter']);
    expect(keys(MetricsOptionsAugmentations)).toEqual(['disableMetrics', 'enableMetrics']);
    expect(keys(TracingOptionsAugmentations)).toEqual(['disableTracing', 'enableTracing']);
  });

  test('every member is a receiver-first function', () => {
    for (const set of [ConfigBuilderJsonAugmentations, ConfigBuilderEnvAugmentations, ConfigBuilderCommandLineAugmentations, MemoryConfigBuilderAugmentations, ServiceManifestOptionsAugmentations,
      LoggerFilterOptionsExtensions, MetricsOptionsAugmentations, TracingOptionsAugmentations]) {
      for (const name of Object.keys(set)) {
        expect((set as Record<string, unknown>)[name]).toBeInstanceOf(Function);
      }
    }
  });
});
