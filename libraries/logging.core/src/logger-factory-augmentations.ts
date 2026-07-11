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
// Standalone-only, permanently: NO registry registration and NO method form.
// The member's name IS `ILoggerFactory`'s own primitive `createLogger`, so a
// prototype install would overwrite each concrete factory's implementation
// with a thunk that delegates straight back into itself (the string case
// self-recurses). Same exclusion precedent as caching's `tryGetValue` (§29)
// and the `log` wrapper (§40) — and since this set has no other member, there
// is nothing to register at all.

import type { AugmentationSet } from '@rhombus-std/primitives';
import type { AbstractCtor } from '@rhombus-toolkit/func';
import type { ILogger } from './logger';
import type { ILoggerFactory } from './logger-factory';

/**
 * The `LoggerFactoryExtensions` augmentation set for {@link ILoggerFactory}
 * (docs §28/§38). Standalone-only — see the header comment; reached as
 * `LoggerFactoryExtensions.createLogger(factory, MyService)`.
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
