// The logging registrations, published as a manifest built on the narrowest
// lifetime vocabulary it actually uses. A consumer merges it into their own
// manifest -- `services.add(getLoggingManifest())` -- and that merge is
// what checks their vocabulary covers what these registrations ask for.

import { Manifest } from '@rhombus-std/di.core';
import type {} from '@rhombus-std/di.extras';
import { ILoggerFactory, ILoggerProvider, type ILoggingBuilder, Logger as LoggerOfT, LogLevel } from '@rhombus-std/logging.core';
import { type IConfigureOptions, IOptions } from '@rhombus-std/options';
import { Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/types';
import { DefaultLoggerLevelConfigureOptions } from './DefaultLoggerLevelConfigureOptions';
import { LoggerFactory } from './LoggerFactory';
import { LoggerFilterOptions } from './LoggerFilterOptions';
import { LoggingBuilder } from './LoggingBuilder';

/**
 * The logging registrations: the LoggerFilterOptions assembly (defaulted to the
 * Information minimum level), the singleton `ILoggerFactory`, injected with the
 * enumerable provider set and the assembled options, and the open
 * `ILogger<$1> -> Logger<$1>` registration, the closing type flowing in
 * through the `$1` placeholder.
 *
 * @remarks
 * `configure` runs over a concrete {@link ILoggingBuilder}, and whatever it
 * registers is part of the returned manifest.
 */
export function getLoggingManifest(configure?: Func<[ILoggingBuilder], void>): Manifest<'singleton'> {
  // The LoggerFilterOptions assembly + its default (Information) min level.
  let m: Manifest<'singleton'> = Manifest.empty<'singleton'>().addOptions(typefor<LoggerFilterOptions>(), () => new LoggerFilterOptions());
  m = m.addValue<IConfigureOptions<LoggerFilterOptions>>(new DefaultLoggerLevelConfigureOptions(LogLevel.Information));

  // ILoggerFactory, injected with the enumerable provider set and the
  // assembled IOptions<LoggerFilterOptions>.
  m = m.add(typefor<ILoggerFactory>(), LoggerFactory, Type.ctor(typefor<ILoggerFactory>(), [[Type.array(typefor<ILoggerProvider>()), typefor<IOptions<LoggerFilterOptions>>()]]), 'singleton');

  // The open ILogger<$1> -> Logger<$1> registration: the closing type flows
  // in through the `$1` placeholder, from which Logger<T> derives its category.
  //
  // The base is written out rather than derived, because `ILogger` is a
  // defaulted generic: a bare `typefor<ILogger>()` records the default type
  // argument and yields `ILogger<unknown>`, not the clean open base. An
  // explicit `typefor<ILogger<Foo>>()` derives off this same base, so the
  // template matches.
  const hole = Type.generic('$1');
  const openLoggerType = Type.imported('ILogger', '@rhombus-std/logging.core', [hole]);
  m = m.add(openLoggerType, LoggerOfT, Type.ctor(openLoggerType, [[typefor<ILoggerFactory>(), hole]]), 'singleton');

  return LoggingBuilder.run(m, configure);
}
