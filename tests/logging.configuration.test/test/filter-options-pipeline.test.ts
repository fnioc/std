// End-to-end: `addConfiguration(builder, config)` registers the LAZY
// `Options<LoggerFilterOptions>` pipeline — the parse runs when the options
// materialize (not at registration), the rule set mirrors the reference
// shape (global "LogLevel", per-provider "<provider>:LogLevel", "Default"
// category → catch-all), and a configuration reload re-runs the parse and
// notifies subscribers.
//
// Exercised through the public authoring surface only; the options token is
// the hand-written literal a no-transformer consumer writes — byte-identical
// to the inline `nameof<Options<LoggerFilterOptions>>()` the library derives.

import { ConfigurationBuilder, type IConfigurationRoot } from '@rhombus-std/config';
import { ServiceManifest } from '@rhombus-std/di';
import { LoggerFilterOptions, LoggingBuilder } from '@rhombus-std/logging';
import '@rhombus-std/logging.configuration';
import { LogLevel } from '@rhombus-std/logging.core';
import type { Options } from '@rhombus-std/options';
import { describe, expect, test } from 'bun:test';

const FILTER_OPTIONS_TOKEN = '@rhombus-std/options:Options<@rhombus-std/logging:LoggerFilterOptions>';

function rootWith(data: Record<string, string>): IConfigurationRoot {
  // build() is typed to the index-navigable Section (the coercion seam); the
  // runtime object IS the ConfigurationRoot, so cast to reach reload()/set().
  return new ConfigurationBuilder().addInMemoryCollection(data).build() as unknown as IConfigurationRoot;
}

function filterOptionsFor(config: IConfigurationRoot): Options<LoggerFilterOptions> {
  const services = new ServiceManifest<'singleton'>();
  new LoggingBuilder(services).addConfiguration(config);
  const provider = services.build().createScope('singleton');
  return provider.resolve<Options<LoggerFilterOptions>>(FILTER_OPTIONS_TOKEN);
}

describe('addConfiguration — the LoggerFilterOptions pipeline', () => {
  test('binds global, per-provider, and Default-category rules plus captureScopes', () => {
    const options = filterOptionsFor(rootWith({
      CaptureScopes: 'false',
      'LogLevel:Default': 'Information',
      'LogLevel:MyApp': 'Debug',
      'Console:LogLevel:Default': 'Warning',
    }));

    const value = options.value;
    expect(value).toBeInstanceOf(LoggerFilterOptions);
    expect(value.captureScopes).toBe(false);
    expect(value.rules).toHaveLength(3);

    // The walk visits sections in the configuration's key order, so assert by
    // rule shape rather than position.
    const globalDefault = value.rules.find((rule) =>
      rule.providerName === undefined && rule.categoryName === undefined
    );
    const globalMyApp = value.rules.find((rule) => rule.categoryName === 'MyApp');
    const consoleDefault = value.rules.find((rule) => rule.providerName === 'Console');
    expect(globalDefault!.logLevel).toBe(LogLevel.Information);
    expect(globalMyApp!.providerName).toBeUndefined();
    expect(globalMyApp!.logLevel).toBe(LogLevel.Debug);
    expect(consoleDefault!.categoryName).toBeUndefined();
    expect(consoleDefault!.logLevel).toBe(LogLevel.Warning);
  });

  test('the bind is LAZY — a write after registration but before first resolve is seen', () => {
    const config = rootWith({ 'LogLevel:Default': 'Information' });

    const services = new ServiceManifest<'singleton'>();
    new LoggingBuilder(services).addConfiguration(config);

    // Mutate AFTER registration: an eager bind would have snapshotted
    // Information at addConfiguration time.
    config.set('LogLevel:Default', 'Error');

    const provider = services.build().createScope('singleton');
    const options = provider.resolve<Options<LoggerFilterOptions>>(FILTER_OPTIONS_TOKEN);
    expect(options.value.rules[0]!.logLevel).toBe(LogLevel.Error);
  });

  test('a reload delivers a fresh rule set and fires subscribe with it', () => {
    const config = rootWith({ 'LogLevel:Default': 'Information' });
    const options = filterOptionsFor(config);
    expect(options.value.rules[0]!.logLevel).toBe(LogLevel.Information);

    const seen: LoggerFilterOptions[] = [];
    const registration = options.subscribe!((value) => seen.push(value));

    config.set('LogLevel:Default', 'Critical');
    config.reload();

    expect(seen).toHaveLength(1);
    expect(seen[0]!.rules).toHaveLength(1);
    expect(seen[0]!.rules[0]!.logLevel).toBe(LogLevel.Critical);
    expect(options.value.rules[0]!.logLevel).toBe(LogLevel.Critical);

    registration[Symbol.dispose]();
  });

  test('numeric ordinals parse; an unrecognized level value throws at materialization', () => {
    const numeric = filterOptionsFor(rootWith({ 'LogLevel:Default': '4' }));
    expect(numeric.value.rules[0]!.logLevel).toBe(LogLevel.Error);

    const bogus = filterOptionsFor(rootWith({ 'LogLevel:Default': 'Loud' }));
    expect(() => bogus.value).toThrow("The log level value 'Loud' is not supported.");
  });

  test('the standalone member form registers the identical pipeline', async () => {
    const { LoggingBuilderExtensions } = await import('@rhombus-std/logging.configuration');
    const config = rootWith({ 'LogLevel:Default': 'Debug' });

    const services = new ServiceManifest<'singleton'>();
    LoggingBuilderExtensions.addConfiguration(new LoggingBuilder(services), config);

    const provider = services.build().createScope('singleton');
    const options = provider.resolve<Options<LoggerFilterOptions>>(FILTER_OPTIONS_TOKEN);
    expect(options.value.rules[0]!.logLevel).toBe(LogLevel.Debug);
  });
});
