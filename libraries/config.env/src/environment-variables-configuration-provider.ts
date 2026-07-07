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

import { ConfigurationProvider } from "@rhombus-std/config";
import type { EnvironmentVariablesConfigurationSource } from "./environment-variables-configuration-source";

export class EnvironmentVariablesConfigurationProvider extends ConfigurationProvider {
  readonly #source: EnvironmentVariablesConfigurationSource;

  public constructor(source: EnvironmentVariablesConfigurationSource) {
    super();
    this.#source = source;
  }

  public override load(): void {
    this.data.clear();

    const { prefix, variableNameTransformation, env } = this.#source;

    for (const [rawName, value] of Object.entries(env)) {
      if (value === undefined) {
        continue;
      }

      const transformedName = variableNameTransformation(rawName);

      // Narrow `prefix` via an early continue rather than a separate
      // `foldedPrefix === undefined` check + a `prefix!` assertion below --
      // the same `undefined` check does both jobs.
      if (prefix === undefined) {
        this.set(transformedName, value);
        continue;
      }

      if (!transformedName.toLowerCase().startsWith(prefix.toLowerCase())) {
        continue;
      }

      this.set(transformedName.slice(prefix.length), value);
    }
  }
}
