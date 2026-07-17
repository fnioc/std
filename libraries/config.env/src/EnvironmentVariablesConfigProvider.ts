// EnvironmentVariablesConfigProvider -- loads `process.env` into the
// case-insensitive ConfigProvider store.
//
// Transform-before-filter order: each raw variable name is run through
// `source.variableNameTransformation` FIRST (default `__` -> `:`), and only
// THEN checked against `source.prefix` with a case-insensitive prefix match.
// This is more correct than filtering on the raw name: a prefix such as
// "Foo:Bar:" only becomes visible on `Foo__Bar__Baz` after the `__` -> `:`
// translation runs, so filtering on the untransformed name would silently
// drop variables a caller reasonably expects to match. Costs nothing given
// the base ConfigProvider's case-insensitive store.
//
// The prefix itself is run through the SAME transformation before matching
// (once per load(), not per variable) -- so a caller may spell `prefix` in
// either the raw pre-transform form ("Foo__Bar__") or the already-delimited
// form ("Foo:Bar:"); the transformation is idempotent on the latter, so this
// is a strict superset of matching only the raw form.
//
// Connection-string prefixes: some deployment platforms inject connection
// strings as environment variables under conventional `*CONNSTR_` prefixes. A
// variable whose name starts (case-insensitively) with one of these is
// re-keyed into the `ConnectionStrings` section -- `SQLCONNSTR_Db` becomes
// `ConnectionStrings:Db` -- so it lands where a connection-string lookup
// expects it. The reference additionally emits a `<name>_ProviderName` sibling
// naming the ADO provider for four of these prefixes; those provider-name
// values are omitted here (they are runtime-stack-specific identifiers with no
// analog in this ecosystem), so no `_ProviderName` key is written.

import { ConfigProvider } from '@rhombus-std/config';
import type { Func } from '@rhombus-toolkit/func';
import type { EnvironmentVariablesConfigSource } from './EnvironmentVariablesConfigSource';

/**
 * The conventional environment-variable prefixes under which deployment
 * platforms inject connection strings. A matching variable is re-keyed into
 * the `ConnectionStrings` section (the prefix stripped).
 */
const CONNECTION_STRING_PREFIXES: readonly string[] = [
  'MYSQLCONNSTR_',
  'SQLAZURECONNSTR_',
  'SQLCONNSTR_',
  'POSTGRESQLCONNSTR_',
  'CUSTOMCONNSTR_',
  'APIHUBCONNSTR_',
  'DOCDBCONNSTR_',
  'EVENTHUBCONNSTR_',
  'NOTIFICATIONHUBCONNSTR_',
  'REDISCACHECONNSTR_',
  'SERVICEBUSCONNSTR_',
];

export class EnvironmentVariablesConfigProvider extends ConfigProvider {
  readonly #source: EnvironmentVariablesConfigSource;

  public constructor(source: EnvironmentVariablesConfigSource) {
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

      // A connection-string variable is re-keyed into ConnectionStrings:*;
      // every other variable keeps its transformed name.
      const name = effectiveName(rawName, variableNameTransformation);

      // Narrow `transformedPrefix` via an early continue rather than a
      // separate `undefined` check + a non-null assertion below -- the same
      // `undefined` check does both jobs.
      if (transformedPrefix === undefined) {
        this.set(name, value);
        continue;
      }

      if (!name.toLowerCase().startsWith(transformedPrefix.toLowerCase())) {
        continue;
      }

      this.set(name.slice(transformedPrefix.length), value);
    }

    this.onReload();
  }
}

/**
 * The configuration key a raw variable maps to: a `*CONNSTR_`-prefixed name is
 * re-keyed to `ConnectionStrings:<transformed-rest>`; every other name is just
 * transformed. The `ConnectionStrings:` segment itself is not transformed
 * (only the part after the connection-string prefix is).
 */
function effectiveName(rawName: string, transform: Func<[name: string], string>): string {
  const lower = rawName.toLowerCase();
  for (const prefix of CONNECTION_STRING_PREFIXES) {
    if (lower.startsWith(prefix.toLowerCase())) {
      return `ConnectionStrings:${transform(rawName.slice(prefix.length))}`;
    }
  }
  return transform(rawName);
}
