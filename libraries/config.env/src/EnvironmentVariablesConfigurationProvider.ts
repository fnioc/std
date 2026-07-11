// EnvironmentVariablesConfigurationProvider -- loads `process.env` into the
// case-insensitive ConfigurationProvider store.
//
// Transform-before-filter order: each raw variable name is run through
// `source.variableNameTransformation` FIRST (default `__` -> `:`), and only
// THEN checked against `source.prefix` with a case-insensitive prefix match.
// This is more correct than filtering on the raw name: a prefix such as
// "Foo:Bar:" only becomes visible on `Foo__Bar__Baz` after the `__` -> `:`
// translation runs, so filtering on the untransformed name would silently
// drop variables a caller reasonably expects to match. Costs nothing given
// the base ConfigurationProvider's case-insensitive store.
//
// The prefix itself is run through the SAME transformation before matching
// (once per load(), not per variable) -- so a caller may spell `prefix` in
// either the raw pre-transform form ("Foo__Bar__") or the already-delimited
// form ("Foo:Bar:"); the transformation is idempotent on the latter, so this
// is a strict superset of matching only the raw form.

import { ConfigurationProvider } from '@rhombus-std/config';
import type { EnvironmentVariablesConfigurationSource } from './environment-variables-configuration-source';

export class EnvironmentVariablesConfigurationProvider extends ConfigurationProvider {
  readonly #source: EnvironmentVariablesConfigurationSource;

  public constructor(source: EnvironmentVariablesConfigurationSource) {
    super();
    this.#source = source;
  }

  public override load(): void {
    this.data.clear();

    const { prefix, variableNameTransformation, env } = this.#source;
    // See the module doc comment: the prefix is matched against TRANSFORMED
    // names, so it must run through the same transformation itself first.
    const transformedPrefix = prefix === undefined ? undefined : variableNameTransformation(prefix);

    for (const [rawName, value] of Object.entries(env)) {
      if (value === undefined) {
        continue;
      }

      const transformedName = variableNameTransformation(rawName);

      // Narrow `transformedPrefix` via an early continue rather than a
      // separate `undefined` check + a non-null assertion below -- the same
      // `undefined` check does both jobs.
      if (transformedPrefix === undefined) {
        this.set(transformedName, value);
        continue;
      }

      if (!transformedName.toLowerCase().startsWith(transformedPrefix.toLowerCase())) {
        continue;
      }

      this.set(transformedName.slice(transformedPrefix.length), value);
    }

    this.onReload();
  }
}
