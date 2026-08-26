// The ILoggingBuilder half of the filter augmentations (docs §28/§38): the
// builder-level `addFilter` routes through the options-configure pipeline — the
// port of the reference's `builder.Services.Configure<LoggerFilterOptions>(...)`
// bridge. Each call registers a configure step against
// LOGGER_FILTER_OPTIONS_TYPE; the steps materialize when the consumer registers
// the `IOptions<LoggerFilterOptions>` assembly for the same token (`addOptions`)
// and resolves it. Covers both dual-export forms, both overload shapes, rule
// accumulation across calls, and chaining.

import { di, noop } from '@rhombus-std/di';
import { Manifest } from '@rhombus-std/di.core';
import { FilterLoggingBuilderExtensions, LOGGER_FILTER_OPTIONS_ACCESSOR_TYPE, LOGGER_FILTER_OPTIONS_TYPE, LoggerFilterOptions, LoggingBuilder } from '@rhombus-std/logging';
import type { ILoggingBuilder } from '@rhombus-std/logging.core';
import { LogLevel } from '@rhombus-std/logging.core';
import type { IOptions } from '@rhombus-std/options';
import '@rhombus-std/options.augmentations';
import { describe, expect, test } from 'bun:test';

/**
 * Registers the `IOptions<LoggerFilterOptions>` assembly for the shared token and
 * resolves the materialized value — the consumer-side wiring that runs every
 * configure step `addFilter` registered through the builder.
 *
 * It reads the manifest OFF THE BUILDER rather than taking one: the chain is
 * immutable, so the manifest the builder was constructed with never sees the
 * configure steps — only the one the builder now holds does.
 */
function resolveFilterOptions(builder: ILoggingBuilder): LoggerFilterOptions {
  const services = builder.services.addOptions(LOGGER_FILTER_OPTIONS_TYPE, () => new LoggerFilterOptions());
  const provider = di.usingLifetimeModel(noop()).usingManifest(services).build();
  const options: IOptions<LoggerFilterOptions> = provider.resolve(LOGGER_FILTER_OPTIONS_ACCESSOR_TYPE);
  return options.value;
}

describe('builder-level addFilter — configure-step bridge into IOptions<LoggerFilterOptions>', () => {
  test('a (category, level) rule flows through the pipeline into the resolved options', () => {
    const builder = new LoggingBuilder(Manifest.empty<unknown>());
    builder.addFilter('Cat', LogLevel.Warning); // method form

    const options = resolveFilterOptions(builder);

    expect(options.rules.length).toBe(1);
    expect(options.rules[0]!.categoryName).toBe('Cat');
    expect(options.rules[0]!.logLevel).toBe(LogLevel.Warning);
    expect(options.rules[0]!.filter).toBeUndefined();
  });

  test('a raw (provider, category, level) => boolean filter flows through as a filter rule', () => {
    const builder = new LoggingBuilder(Manifest.empty<unknown>());
    const filter = (_provider: string | undefined, _category: string | undefined, level: LogLevel): boolean => level >= LogLevel.Error;
    builder.addFilter(filter);

    const options = resolveFilterOptions(builder);

    expect(options.rules.length).toBe(1);
    expect(options.rules[0]!.filter).toBe(filter);
    expect(options.rules[0]!.categoryName).toBeUndefined();
  });

  // The predicate arm of the overload set. Both routes to it are exercised: the
  // method the prototype install put on the receiver, and the namespace member
  // called standalone against the same receiver.
  test('method form and standalone member form register the same rule', () => {
    const filter = (): boolean => true;

    const viaMethodBuilder = new LoggingBuilder(Manifest.empty<unknown>());
    viaMethodBuilder.addFilter(filter); // method form

    const viaMemberBuilder = new LoggingBuilder(Manifest.empty<unknown>());
    FilterLoggingBuilderExtensions.addFilter.call(viaMemberBuilder, filter); // standalone member form

    const viaMethod = resolveFilterOptions(viaMethodBuilder);
    const viaMember = resolveFilterOptions(viaMemberBuilder);

    expect(viaMethod.rules.length).toBe(1);
    expect(viaMethod.rules[0]).toEqual(viaMember.rules[0]);
  });

  test('repeated addFilter calls accumulate rules in call order', () => {
    const builder = new LoggingBuilder(Manifest.empty<unknown>());
    builder.addFilter('First', LogLevel.Debug).addFilter('Second', LogLevel.Error);

    const options = resolveFilterOptions(builder);

    expect(options.rules.map((rule) => rule.categoryName)).toEqual(['First', 'Second']);
  });

  test('both forms return the builder for chaining', () => {
    const builder = new LoggingBuilder(Manifest.empty<unknown>());

    expect(builder.addFilter('Cat', LogLevel.Information)).toBe(builder);
    expect(FilterLoggingBuilderExtensions.addFilter.call(builder, (_p, _c, _l) => true)).toBe(builder);
  });
});
