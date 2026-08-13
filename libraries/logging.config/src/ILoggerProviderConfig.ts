// `T` is a compile-time phantom -- it only selects which closed service type to
// resolve. The runtime identity is what {@link loggerProviderConfigType} builds,
// and the open template it builds from a generic hole is registered by the no-arg
// `addConfig`, so resolving any closing constructs a `LoggerProviderConfig` for
// that provider.

import type { IConfig } from '@rhombus-std/config.core';
import { type ImportedType, Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';

/**
 * Allows access to the configuration section associated with a logger
 * provider.
 *
 * @typeParam T The type of logger provider to get configuration for
 * (compile-time phantom; the runtime counterpart is the argument to
 * {@link loggerProviderConfigType}).
 */
export interface ILoggerProviderConfig<T> {
  /** The configuration section for the requested logger provider. */
  readonly config: IConfig;
}

// The generic's base, derived rather than spelled. The argument is discarded --
// only `name` and `from` are read -- and the cast is needed because a derivation
// narrows to a kind only for a constructor or a function.
const BASE = typefor<ILoggerProviderConfig<unknown>>() as ImportedType;

/**
 * The `ILoggerProviderConfig<argument>` service type.
 *
 * @remarks
 * One function serves both the closed and the open form, because an open
 * template differs only in taking a generic hole as its argument. Pass the same
 * hole to the registration's service type and to its dependency slot, so the two
 * cannot drift.
 */
export function loggerProviderConfigType(argument: Type): Type {
  return Type.imported(BASE.name, BASE.from, [argument]);
}
