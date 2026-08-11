// Two arities share the `addConfig` member on ILoggingBuilder: the no-arg
// form registers only the plumbing needed to resolve
// ILoggerProviderConfigFactory / ILoggerProviderConfig<T>; the one-arg form
// additionally binds LoggerFilterOptions to `config`, lazily and
// reload-reactively -- nothing touches configuration until the
// IOptions<LoggerFilterOptions> assembly materializes, and a configuration
// reload re-runs the bind.

import type { IConfig } from '@rhombus-std/config.core';
import { LoggerFilterOptions } from '@rhombus-std/logging';
import type { ILoggingBuilder } from '@rhombus-std/logging.core';
import type { IOptions } from '@rhombus-std/options';
import { changeTokenSourceToken, ConfigChangeTokenSource,
  configureStepToken } from '@rhombus-std/options.augmentations';
import { type AugmentationSet2, type Flatten, registerAugmentations, Type } from '@rhombus-std/primitives';
import { tokenfor, typefor } from '@rhombus-std/primitives.extras';
import { loggerProviderConfigType } from './ILoggerProviderConfig';
import type { ILoggerProviderConfigFactory } from './ILoggerProviderConfigFactory';
import { LoggerFilterConfigureOptions } from './LoggerFilterConfigureOptions';
import { LoggerProviderConfig } from './LoggerProviderConfig';
import { LoggerProviderConfigFactory } from './LoggerProviderConfigFactory';
import { LoggingConfig } from './LoggingConfig';

/** The `addConfig` augmentation set for {@link ILoggingBuilder}. */
interface ILoggingBuilderConfigAugmentations {
  /** Registers the provider-configuration services, with no filter binding. */
  addConfig(): void;
  /**
   * Registers the provider-configuration services and binds `config` to the
   * `IOptions<LoggerFilterOptions>` pipeline, reactive to its reload token.
   */
  addConfig(config: IConfig): this;
}

// Merges onto the owning ILoggingBuilder interface so a consumer holding it
// sees the method. Concrete implementers inherit it through their own
// `interface ... extends ILoggingBuilder` merge.
declare module '@rhombus-std/logging.core' {
  interface ILoggingBuilder extends ILoggingBuilderConfigAugmentations {}
}

export const LoggingBuilderConfigAugmentations: AugmentationSet2<ILoggingBuilder,
  Flatten<ILoggingBuilderConfigAugmentations>> = {
    /**
     * No-arg: adds the services required to resolve
     * {@link ILoggerProviderConfigFactory} or `ILoggerProviderConfig<T>`.
     * One-arg: additionally configures `LoggerFilterOptions` from `config` as
     * a lazy, reload-reactive options pipeline. Returns the builder for
     * chaining.
     */
    addConfig(builder: ILoggingBuilder, ...rest: [] | [config: IConfig]): ILoggingBuilder {
      // The no-arg provider-configuration services are always registered. The
      // factory injects the accumulated LoggingConfig collection; the open
      // ILoggerProviderConfig<$1> template closes per provider, its
      // typeArg(1) slot reifying the closing token as the constructor's
      // provider-type argument.
      //
      // `builder.services` is a mutable field, but the manifest chain itself
      // is immutable: each step below reassigns it to the manifest its own
      // registration produced, so the final value is what the caller reads
      // back through `builder.services`.
      builder.services = builder.services.addClass(typefor<ILoggerProviderConfigFactory>(), LoggerProviderConfigFactory,
        [[Type.named('Array', 'global', [typefor<LoggingConfig>()])]], 'singleton');
      const hole = Type.placeholder('$1');
      builder.services = builder.services.addClass(loggerProviderConfigType(hole), LoggerProviderConfig, [[
        typefor<ILoggerProviderConfigFactory>(),
        hole,
      ]], 'singleton');

      if (!rest.length) {
        return builder;
      }
      const [config] = rest;

      // The LoggerFilterOptions pipeline: assembly + custom configure step +
      // reload change-token source.
      const optionsToken = tokenfor<IOptions<LoggerFilterOptions>>();
      builder.services = builder.services.addOptions<LoggerFilterOptions>(optionsToken,
        () => new LoggerFilterOptions());
      builder.services = builder.services.addValue(configureStepToken(optionsToken),
        new LoggerFilterConfigureOptions(config));
      builder.services = builder.services.addValue(changeTokenSourceToken(optionsToken),
        new ConfigChangeTokenSource(config));

      builder.services = builder.services.addValue(typefor<LoggingConfig>(), new LoggingConfig(config));
      return builder;
    },
  };

registerAugmentations(typefor<ILoggingBuilder>(), LoggingBuilderConfigAugmentations);
