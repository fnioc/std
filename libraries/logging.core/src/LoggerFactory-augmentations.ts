// The `ILoggerFactory` convenience wrapper `createLogger(type)`, which
// names a logger after a constructor.
//
// Its name collides with `ILoggerFactory`'s own `createLogger` primitive, so it
// registers a merge strategy: on a decorated factory it is dot-callable at
// runtime as `factory.createLogger(MyService)`, routing a constructor to this
// wrapper and a category string to the primitive. It is not typed as a method
// overload (TS2430) -- hence no interface-side merge -- and the typed path is
// the standalone `LoggerFactoryAugmentations.createLogger.call(factory, MyService)`.

import type { MergeStrategies } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { AbstractCtor } from '@rhombus-toolkit/func';
import type { ILogger } from './ILogger';
import type { ILoggerFactory } from './logger-factory';

/**
 * The `createLogger` wrapper as an augmentation set for {@link ILoggerFactory}:
 * reached standalone as `LoggerFactoryAugmentations.createLogger.call(factory, MyService)`,
 * and dot-callable at runtime on a decorated factory as
 * `factory.createLogger(MyService)`.
 */
export namespace LoggerFactoryAugmentations {
  /**
   * Creates a new {@link ILogger} whose category is the given constructor's
   * `name`. Accepts abstract constructors — only the name is read.
   */
  export function createLogger(this: ILoggerFactory, type: AbstractCtor): ILogger {
    return this.createLogger(type.name);
  }
}

// The `createLogger` merge strategy: the convenience form takes a type
// (constructor); the primitive takes a category-name string.
const factoryMerge = { createLogger(original, incoming) {
  return function(this: ILoggerFactory, first: unknown, ...rest: unknown[]) {
    if (typeof first === 'function') {
      return incoming.call(this, first, ...rest);
    }
    return original.call(this, first, ...rest);
  };
} } satisfies MergeStrategies<ILoggerFactory>;

registerAugmentations<ILoggerFactory>(LoggerFactoryAugmentations, factoryMerge);
