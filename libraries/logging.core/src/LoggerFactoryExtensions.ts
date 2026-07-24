// The ILoggerFactory convenience wrapper, ported from ME.Logging.Abstractions'
// static `LoggerFactoryExtensions` class — authored as the named
// `LoggerFactoryExtensions` augmentation object literal (docs §28/§38),
// receiver-first.
//
// Only the explicit type-receiving `CreateLogger(factory, type)` form is
// ported: the reference's generic `CreateLogger<T>(factory)` is compile-time
// sugar over it (TS erases the type argument at runtime), and type-driven
// sugar is transformer territory — out of scope here per the
// no-transformer-first rule.
//
// Category-name derivation: the reference computes a display name via its
// internal type-name helper — the namespace-qualified full name with the
// generic arity stripped (`includeGenericParameters: false`) and nested types
// delimited with '.'. A TS runtime constructor carries none of that (no
// namespaces, no runtime generics, no nested-type chain), so the faithful
// adaptation is the constructor's own `name` — the entire helper collapses to
// `type.name`, no internal `TypeNameHelper` analog needed.
//
// The member's name IS `ILoggerFactory`'s own primitive `createLogger`, so the
// set registers with a merge strategy: at install the registry mounts a
// dispatcher over each decorated factory's `createLogger` that routes a type
// (constructor) to this wrapper and a category-name string to the primitive.
// The wrapper re-enters the receiver in primitive shape (`createLogger(type.name)`),
// so the dispatcher routes that back to the primitive — no self-recursion. The
// convenience form is thus dot-callable AT RUNTIME on any `@augment`-decorated
// factory; it is not TYPED as a method overload (a factory declares the
// primitive `createLogger(string)` in its body, and TS forbids merging the
// incompatible `createLogger(type)` overload onto it, TS2430). The typed path
// stays the standalone `LoggerFactoryExtensions.createLogger(factory, MyService)`.

import { type AugmentationSet, type MergeStrategies, registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import type { AbstractCtor } from '@rhombus-toolkit/func';
import type { ILogger } from './ILogger';
import type { ILoggerFactory } from './logger-factory';

/**
 * The `LoggerFactoryExtensions` augmentation set for {@link ILoggerFactory}
 * (docs §28/§38). Reached standalone as
 * `LoggerFactoryExtensions.createLogger(factory, MyService)` and, on a decorated
 * concrete factory, as the runtime dot-callable `factory.createLogger(MyService)`.
 */
export const LoggerFactoryExtensions = {
  /**
   * Creates a new {@link ILogger} whose category is the given constructor's
   * `name`. (The reference derives the type's namespace-qualified full name;
   * a TS constructor has no namespace, so the bare class name is the whole
   * display name.) Accepts abstract constructors — only the name is read.
   */
  createLogger(factory: ILoggerFactory, type: AbstractCtor): ILogger {
    return factory.createLogger(type.name);
  },
} satisfies AugmentationSet<ILoggerFactory>;

// The `createLogger` merge strategy: the convenience form takes a type
// (constructor); the primitive takes a category-name string.
const factoryMerge = {
  createLogger(original, extension) {
    return function(this: ILoggerFactory, first: unknown, ...rest: unknown[]) {
      if (typeof first === 'function') {
        return extension(this, first, ...rest);
      }
      return original.call(this, first, ...rest);
    };
  },
} satisfies MergeStrategies;

registerAugmentations(tokenfor<ILoggerFactory>(), LoggerFactoryExtensions, factoryMerge);
