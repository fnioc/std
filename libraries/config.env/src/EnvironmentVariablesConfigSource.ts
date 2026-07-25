// The source side: what to read, and how names are translated. The translation
// itself runs in EnvironmentVariablesConfigProvider, which documents the order
// it applies the transformation and the prefix filter in.

import type { IConfigBuilder, IConfigProvider, IConfigSource } from '@rhombus-std/config.core';
import { process } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';
import { EnvironmentVariablesConfigProvider } from './EnvironmentVariablesConfigProvider';

export interface EnvironmentVariablesConfigSourceOptions {
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
   * The environment map to read; defaults to `process.env`. Pass your own for a
   * hermetic source, instead of mutating the ambient `process.env`.
   */
  env?: Record<string, string | undefined>;
}

/** `__` -> `:` — the default {@link EnvironmentVariablesConfigSourceOptions.variableNameTransformation}. */
export function defaultVariableNameTransformation(name: string): string {
  return name.replaceAll('__', ':');
}

/**
 * An alternate {@link EnvironmentVariablesConfigSourceOptions.variableNameTransformation}:
 * every `___` becomes `.`, then every remaining `__` becomes `:`.
 *
 * @remarks
 * The `___` pass MUST run first: reversing the order would consume two of every
 * three underscores in a `___` run as a `:`, leaving a stray `_` where a `.`
 * belonged (`A___B` would misparse as `A:_B` instead of `A.B`). Both passes are
 * non-overlapping left-to-right scans, so a run of underscores is consumed
 * greedily from the left -- a run of four is one triple plus a literal
 * underscore (`._`), not two colons.
 */
export function colonAndDotVariableNameTransformation(name: string): string {
  return name.replaceAll('___', '.').replaceAll('__', ':');
}

/**
 * A configuration source backed by `process.env`, flattened into the
 * colon-delimited key/value store every provider produces, per an optional
 * name prefix and a variable-name transformation.
 */
export class EnvironmentVariablesConfigSource implements IConfigSource {
  /** Only variables whose transformed name starts with this prefix (case-insensitive) are kept. */
  public prefix?: string;
  /** Applied to each raw variable name before prefix matching. */
  public variableNameTransformation: Func<[string], string>;
  /** The environment map read at load time (defaults to `process.env`). */
  public env: Record<string, string | undefined>;

  public constructor(options?: EnvironmentVariablesConfigSourceOptions) {
    this.prefix = options?.prefix;
    this.variableNameTransformation = options?.variableNameTransformation ?? defaultVariableNameTransformation;
    this.env = options?.env ?? process.env;
  }

  public build(_builder: IConfigBuilder): IConfigProvider {
    return new EnvironmentVariablesConfigProvider(this);
  }
}
