// EnvironmentVariablesConfigurationSource.
//
// Two pieces of translation happen when a provider built from this source
// loads: a variable-name transformation (default `__` -> `:`, matching most
// shells/platforms being unable to hold a literal colon in an env var name)
// applied to the FULL variable name first, THEN an optional case-insensitive
// prefix match/strip against the transformed name. This order matters: a
// prefix like "Foo:Bar:" only becomes visible on a raw variable such as
// `Foo__Bar__Baz` AFTER the `__` -> `:` transform runs, so the transform must
// happen before prefix-matching, not after (see the provider for where this
// is actually applied); the provider runs the configured prefix through the
// same transformation before matching, so a caller-supplied prefix may be
// spelled in either raw (`Foo__Bar__`) or already-transformed (`Foo:Bar:`)
// form. There's no connection-string special-casing here -- this provider
// only handles the generic name-transform/prefix-filter path.
//
// `colonAndDotVariableNameTransformation` below is a drop-in alternative to
// the default transform, for names that also want a `.` delimiter.

import type { IConfigurationBuilder, IConfigurationProvider, IConfigurationSource } from '@rhombus-std/config.core';
import { process } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';
import { EnvironmentVariablesConfigurationProvider } from './EnvironmentVariablesConfigurationProvider';

/** Options accepted by {@link EnvironmentVariablesConfigurationSource}. */
export interface EnvironmentVariablesConfigurationSourceOptions {
  /**
   * Only variables whose TRANSFORMED name starts with `prefix` (case-insensitive)
   * are kept; the prefix is stripped from the resulting key.
   */
  prefix?: string;
  /**
   * Transforms a raw environment variable name before prefix matching.
   * Defaults to replacing every `__` with `:`, the conventional way to spell
   * a section-delimited key in an environment variable name.
   */
  variableNameTransformation?: Func<[string], string>;
  /**
   * The environment map to read. Defaults to `process.env`. Injectable so
   * `load()` is pure with respect to an explicit map -- tests (and any caller
   * wanting a hermetic source) pass their own instead of mutating the ambient
   * `process.env`.
   */
  env?: Record<string, string | undefined>;
}

/** Default {@link EnvironmentVariablesConfigurationSourceOptions.variableNameTransformation}: `__` -> `:`. */
export function defaultVariableNameTransformation(name: string): string {
  return name.replaceAll('__', ':');
}

/**
 * An alternate {@link EnvironmentVariablesConfigurationSourceOptions.variableNameTransformation}:
 * replaces every `___` with `.`, then every remaining `__` with `:`. The
 * `___` pass MUST run first -- reversing the order would consume two of
 * every three underscores in a `___` run as a `:`, leaving a stray `_` where
 * a `.` belonged (`A___B` would misparse as `A:_B` instead of `A.B`). Both
 * passes are simple non-overlapping left-to-right scans, so a run of
 * underscores is always consumed greedily from the left -- a run of four
 * is one triple plus a literal underscore (`._`), not two colons.
 */
export function colonAndDotVariableNameTransformation(name: string): string {
  return name.replaceAll('___', '.').replaceAll('__', ':');
}

/**
 * A configuration source backed by `process.env`, flattened into the
 * colon-delimited key/value store every provider produces, per an optional
 * name prefix and a variable-name transformation.
 */
export class EnvironmentVariablesConfigurationSource implements IConfigurationSource {
  /** Only variables whose transformed name starts with this prefix (case-insensitive) are kept. */
  public prefix?: string;
  /** Applied to each raw variable name before prefix matching. */
  public variableNameTransformation: Func<[string], string>;
  /** The environment map read at load time (defaults to `process.env`). */
  public env: Record<string, string | undefined>;

  public constructor(options?: EnvironmentVariablesConfigurationSourceOptions) {
    this.prefix = options?.prefix;
    this.variableNameTransformation = options?.variableNameTransformation ?? defaultVariableNameTransformation;
    this.env = options?.env ?? process.env;
  }

  public build(_builder: IConfigurationBuilder): IConfigurationProvider {
    return new EnvironmentVariablesConfigurationProvider(this);
  }
}
