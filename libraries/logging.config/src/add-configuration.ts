// addConfig — the ILoggingBuilder configuration surface, ported from
// the reference logging configuration project's `LoggingBuilderExtensions.
// AddConfiguration(builder, configuration)` AND `LoggingBuilderConfiguration
// Extensions.AddConfiguration(builder)` (the no-arg provider-configuration
// registration). Two reference static classes share the one member name over
// the one receiver, and the registry's flat per-token bag forbids a second
// `addConfig` member on the `ILoggingBuilder` token (docs §38), so the
// one-arg member absorbs the no-arg by arity — the same disambiguation
// precedent options.augmentations' `configure` uses. Union-tuple rest, §42.
//
// ILoggingBuilder is @rhombus-std/logging.core's own interface and an OPEN
// receiver, so this downstream extender registers the set against the shared
// `nameof<ILoggingBuilder>()` token; the @augment-decorated LoggingBuilder
// pulls `builder.addConfig(…)` onto its prototype. The exported const
// IS the standalone call surface.
//
// What the one-arg form registers — the faithful LAZY pipeline (nothing binds
// until the `IOptions<LoggerFilterOptions>` assembly materializes; a
// configuration reload re-runs it):
//
//   - the no-arg provider-configuration services (the reference's first line);
//   - a `LoggerFilterConfigureOptions` configure step + a
//     `ConfigChangeTokenSource` at the `IOptions<LoggerFilterOptions>`
//     token's pipeline slots (the reference's `IConfigureOptions` /
//     `IOptionsChangeTokenSource` singletons);
//   - the `LoggingConfig` holder (accumulated — the provider-
//     configuration factory injects the whole collection);
//   - the `IOptions<LoggerFilterOptions>` ASSEMBLY itself. The reference gets
//     this from `AddLogging`'s ambient `services.AddOptions()` open-generic
//     infrastructure; per-token assembly registration is explicit here, and
//     `addLogging` does not register it, so `addConfig` does.
//     Re-registration on repeat calls is append-only last-wins — same net
//     behavior as the reference's TryAdd (di.core has no add-if-absent
//     surface; see @rhombus-std/logging's addLogging precedent note).
//
// The options token is derived INLINE (`nameof<IOptions<LoggerFilterOptions>>()`
// → `"@rhombus-std/options:IOptions<@rhombus-std/logging:LoggerFilterOptions>"`,
// docs §40) — the same token the logging family's own consumers derive from
// the type, with no shared const.

import type { IConfig } from '@rhombus-std/config.core';
import { closeToken, typeArg } from '@rhombus-std/di.core';
import { LoggerFilterOptions } from '@rhombus-std/logging';
import type { ILoggingBuilder } from '@rhombus-std/logging.core';
import type { IOptions } from '@rhombus-std/options';
import { changeTokenSourceToken, ConfigChangeTokenSource,
  configureStepToken } from '@rhombus-std/options.augmentations';
import { type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { nameof } from '@rhombus-std/primitives';
import { loggerProviderConfigToken } from './ILoggerProviderConfig';
import type { ILoggerProviderConfigFactory } from './ILoggerProviderConfigFactory';
import { LoggerFilterConfigureOptions } from './LoggerFilterConfigureOptions';
import { LoggerProviderConfig } from './LoggerProviderConfig';
import { LoggerProviderConfigFactory } from './LoggerProviderConfigFactory';
import { LoggingConfig } from './LoggingConfig';

/**
 * The `LoggingBuilderExtensions` augmentation set for {@link ILoggingBuilder}
 * (docs §28) — mirrors the reference logging configuration project's
 * `LoggingBuilderExtensions` (and, via the no-arg arity, its
 * `LoggingBuilderConfigurationExtensions`).
 */
export const LoggingBuilderExtensions = {
  /**
   * No-arg: adds the services required to consume
   * {@link ILoggerProviderConfigFactory} or
   * `ILoggerProviderConfig<T>` (the `LoggingBuilderConfiguration
   * Extensions.AddConfiguration` mirror). One-arg: additionally configures
   * `LoggerFilterOptions` from `config` — a lazy, reload-reactive
   * options pipeline. Returns the builder for chaining.
   */
  addConfig(builder: ILoggingBuilder, ...rest: [] | [config: IConfig]): ILoggingBuilder {
    // ── The no-arg provider-configuration services (always registered — the
    // reference one-arg form calls the no-arg form first). The factory
    // injects the accumulated LoggingConfig collection; the open
    // ILoggerProviderConfig<$1> template closes per provider, its
    // typeArg(1) slot reifying the closing token as the constructor's
    // provider-type argument.
    builder.services
      .add(
        nameof<ILoggerProviderConfigFactory>(),
        LoggerProviderConfigFactory,
        [[closeToken('Array', nameof<LoggingConfig>())]],
      )
      .as('singleton');
    builder.services
      .add(
        loggerProviderConfigToken('$1'),
        LoggerProviderConfig,
        [[nameof<ILoggerProviderConfigFactory>(), typeArg(1)]],
      )
      .as('singleton');

    if (!rest.length) {
      return builder;
    }
    const [config] = rest;

    // ── The LoggerFilterOptions pipeline (the LoggingBuilderExtensions
    // mirror): assembly + custom configure step + reload change-token source.
    const optionsToken = nameof<IOptions<LoggerFilterOptions>>();
    builder.services.addOptions<LoggerFilterOptions>(optionsToken, () => new LoggerFilterOptions()).as('singleton');
    builder.services.addValue(configureStepToken(optionsToken), new LoggerFilterConfigureOptions(config));
    builder.services.addValue(changeTokenSourceToken(optionsToken), new ConfigChangeTokenSource(config));

    builder.services.addValue(nameof<LoggingConfig>(), new LoggingConfig(config));
    return builder;
  },
} satisfies AugmentationSet<ILoggingBuilder>;

// The method form (docs §38): merge onto the owning ILoggingBuilder interface so
// a consumer holding it sees both arities, then register the set against the
// shared ILoggingBuilder augmentation token so the @augment-decorated
// LoggingBuilder pulls it onto its prototype. The no-arg overload mirrors the
// reference's `void` return.
declare module '@rhombus-std/logging.core' {
  interface ILoggingBuilder {
    /** Instance-method form of the no-arg {@link addConfig}. */
    addConfig(): void;
    /** Instance-method form of the one-arg {@link addConfig}. */
    addConfig(config: IConfig): this;
  }
}

registerAugmentations(nameof<ILoggingBuilder>(), LoggingBuilderExtensions);
