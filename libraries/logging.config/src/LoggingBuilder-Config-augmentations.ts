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
import { changeTokenSourceType, ConfigChangeTokenSource, configureStepType } from '@rhombus-std/options.augmentations';
import { type AugmentationSet2, type Flatten, Type } from '@rhombus-std/primitives';
import { registerAugmentations, typefor } from '@rhombus-std/primitives.extras';
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
    addConfig(...rest: [] | [config: IConfig]): ILoggingBuilder {
      // The no-arg provider-configuration services are always registered. The
      // factory injects the accumulated LoggingConfig collection; the open
      // ILoggerProviderConfig<$1> template closes per provider, its
      // typeArg(1) slot reifying the closing token as the constructor's
      // provider-type argument.
      //
      // `this.services` is a mutable field, but the manifest chain itself
      // is immutable: each step below reassigns it to the manifest its own
      // registration produced, so the final value is what the caller reads
      // back through `builder.services`.
      this.services = this.services.addClass(typefor<ILoggerProviderConfigFactory>(), LoggerProviderConfigFactory,
        Type.ctor(typefor<ILoggerProviderConfigFactory>(), Type.array(typefor<LoggingConfig>())), 'singleton');
      const hole = Type.generic('$1');
      this.services = this.services.addClass(loggerProviderConfigType(hole), LoggerProviderConfig,
        Type.ctor(loggerProviderConfigType(hole), typefor<ILoggerProviderConfigFactory>(), hole), 'singleton');

      if (!rest.length) {
        return this;
      }
      const [config] = rest;

      // The LoggerFilterOptions pipeline: the offer + a custom configure step +
      // the reload change-token source.
      const optionsType = typefor<LoggerFilterOptions>();
      this.services = this.services.addOptions<LoggerFilterOptions>(optionsType, () => new LoggerFilterOptions());
      this.services = this.services.addValue(configureStepType(optionsType), new LoggerFilterConfigureOptions(config));
      this.services = this.services.addValue(changeTokenSourceType(optionsType), new ConfigChangeTokenSource(config));

      this.services = this.services.addValue(typefor<LoggingConfig>(), new LoggingConfig(config));
      return this;
    },
  };

registerAugmentations<ILoggingBuilder>(LoggingBuilderConfigAugmentations);
