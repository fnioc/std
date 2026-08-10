// The `ILoggerFactory` convenience wrapper `createLogger(factory, type)`, which
// names a logger after a constructor.
//
// Its name collides with `ILoggerFactory`'s own `createLogger` primitive, so it
// registers a merge strategy: on a decorated factory it is dot-callable at
// runtime as `factory.createLogger(MyService)`, routing a constructor to this
// wrapper and a category string to the primitive. It is not typed as a method
// overload (TS2430) -- hence no interface-side merge -- and the typed path is
// the standalone `LoggerFactoryAugmentations.createLogger(factory, MyService)`.

import { type AugmentationSet2, type Flatten, type MergeStrategies,
  registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import type { AbstractCtor } from '@rhombus-toolkit/func';
import type { ILogger } from './ILogger';
import type { ILoggerFactory } from './logger-factory';

interface ILoggerFactoryAugmentations {
  /**
   * Creates a new {@link ILogger} whose category is the given constructor's
   * `name`. Accepts abstract constructors — only the name is read.
   */
  createLogger(type: AbstractCtor): ILogger;
}

/**
 * The `createLogger` wrapper as an augmentation set for {@link ILoggerFactory}:
 * reached standalone as `LoggerFactoryAugmentations.createLogger(factory, MyService)`,
 * and dot-callable at runtime on a decorated factory as
 * `factory.createLogger(MyService)`.
 */
export const LoggerFactoryAugmentations: AugmentationSet2<ILoggerFactory, Flatten<ILoggerFactoryAugmentations>> = {
  createLogger(factory, type) {
    return factory.createLogger(type.name);
  },
};

// The `createLogger` merge strategy: the convenience form takes a type
// (constructor); the primitive takes a category-name string.
const factoryMerge = { createLogger(original, extension) {
  return function(this: ILoggerFactory, first: unknown, ...rest: unknown[]) {
    if (typeof first === 'function') {
      return extension(this, first, ...rest);
    }
    return original.call(this, first, ...rest);
  };
} } satisfies MergeStrategies;

registerAugmentations(tokenfor<ILoggerFactory>(), LoggerFactoryAugmentations, factoryMerge);
