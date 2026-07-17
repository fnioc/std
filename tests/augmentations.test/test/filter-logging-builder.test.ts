// The ILoggingBuilder half of the filter augmentations (docs §28/§38): the
// builder-level `addFilter` routes through the options-configure pipeline — the
// port of the reference's `builder.Services.Configure<LoggerFilterOptions>(...)`
// bridge. Each call registers a configure step against
// LOGGER_FILTER_OPTIONS_TOKEN; the steps materialize when the consumer registers
// the `IOptions<LoggerFilterOptions>` assembly for the same token (`addOptions`)
// and resolves it. Covers both dual-export forms, both overload shapes, rule
// accumulation across calls, and chaining.

import { type IServiceManifest, ServiceManifest } from '@rhombus-std/di';
import { FilterLoggingBuilderExtensions, LOGGER_FILTER_OPTIONS_TOKEN, LoggerFilterOptions,
  LoggingBuilder } from '@rhombus-std/logging';
import { LogLevel } from '@rhombus-std/logging.core';
import type { IOptions } from '@rhombus-std/options';
import '@rhombus-std/options.augmentations';
import { describe, expect, test } from 'bun:test';

/**
 * Registers the `IOptions<LoggerFilterOptions>` assembly for the shared token and
 * resolves the materialized value — the consumer-side wiring that runs every
 * configure step `addFilter` registered on `services`.
 */
function resolveFilterOptions(services: IServiceManifest<'singleton'>): LoggerFilterOptions {
  services.addOptions(LOGGER_FILTER_OPTIONS_TOKEN, () => new LoggerFilterOptions()).as('singleton');
  const provider = services.build().createScope('singleton');
  return provider.resolve<IOptions<LoggerFilterOptions>>(LOGGER_FILTER_OPTIONS_TOKEN).value;
}

describe('builder-level addFilter — configure-step bridge into IOptions<LoggerFilterOptions>', () => {
  test('a (category, level) rule flows through the pipeline into the resolved options', () => {
    const services = new ServiceManifest<'singleton'>();
    new LoggingBuilder(services).addFilter('Cat', LogLevel.Warning); // method form

    const options = resolveFilterOptions(services);

    expect(options.rules.length).toBe(1);
    expect(options.rules[0]!.categoryName).toBe('Cat');
    expect(options.rules[0]!.logLevel).toBe(LogLevel.Warning);
    expect(options.rules[0]!.filter).toBeUndefined();
  });

  test('a raw (provider, category, level) => boolean filter flows through as a filter rule', () => {
    const services = new ServiceManifest<'singleton'>();
    const filter = (_provider: string | undefined, _category: string | undefined, level: LogLevel): boolean =>
      level >= LogLevel.Error;
    new LoggingBuilder(services).addFilter(filter);

    const options = resolveFilterOptions(services);

    expect(options.rules.length).toBe(1);
    expect(options.rules[0]!.filter).toBe(filter);
    expect(options.rules[0]!.categoryName).toBeUndefined();
  });

  test('method form and standalone member form register the same rule', () => {
    const viaMethodServices = new ServiceManifest<'singleton'>();
    new LoggingBuilder(viaMethodServices).addFilter('Cat', LogLevel.Warning); // method form

    const viaMemberServices = new ServiceManifest<'singleton'>();
    FilterLoggingBuilderExtensions.addFilter( // standalone member form
      new LoggingBuilder(viaMemberServices),
      'Cat',
      LogLevel.Warning,
    );

    const viaMethod = resolveFilterOptions(viaMethodServices);
    const viaMember = resolveFilterOptions(viaMemberServices);

    expect(viaMethod.rules.length).toBe(1);
    expect(viaMethod.rules[0]).toEqual(viaMember.rules[0]);
  });

  test('repeated addFilter calls accumulate rules in call order', () => {
    const services = new ServiceManifest<'singleton'>();
    const builder = new LoggingBuilder(services);
    builder
      .addFilter('First', LogLevel.Debug)
      .addFilter('Second', LogLevel.Error);

    const options = resolveFilterOptions(services);

    expect(options.rules.map((rule) => rule.categoryName)).toEqual(['First', 'Second']);
  });

  test('both forms return the builder for chaining', () => {
    const services = new ServiceManifest<'singleton'>();
    const builder = new LoggingBuilder(services);

    expect(builder.addFilter('Cat', LogLevel.Information)).toBe(builder);
    expect(FilterLoggingBuilderExtensions.addFilter(builder, (_p, _c, _l) => true)).toBe(builder);
  });
});
