// Loads `process.env` into the case-insensitive ConfigProvider store.
//
// TRANSFORM BEFORE FILTER: each raw variable name runs through
// `source.variableNameTransformation` first (default `__` -> `:`), and only THEN
// is checked against `source.prefix` with a case-insensitive prefix match. A
// prefix such as "Foo:Bar:" only becomes visible on `Foo__Bar__Baz` once the
// `__` -> `:` translation has run, so filtering on the untransformed name would
// silently drop variables a caller reasonably expects to match.
//
// The prefix itself runs through the SAME transformation before matching (once
// per load(), not per variable), so a caller may spell it either raw
// ("Foo__Bar__") or already-delimited ("Foo:Bar:") -- the transformation is
// idempotent on the latter.
//
// Connection strings: some deployment platforms inject connection strings as
// environment variables under conventional `*CONNSTR_` prefixes. A variable
// whose name starts (case-insensitively) with one of these is re-keyed into the
// `ConnectionStrings` section -- `SQLCONNSTR_Db` becomes `ConnectionStrings:Db`
// -- so it lands where a connection-string lookup expects it.

import { ConfigProvider } from '@rhombus-std/config';
import type { Func } from '@rhombus-toolkit/types';
import type { EnvironmentVariablesConfigSource } from './EnvironmentVariablesConfigSource';

/**
 * The conventional environment-variable prefixes under which deployment
 * platforms inject connection strings. A matching variable is re-keyed into
 * the `ConnectionStrings` section (the prefix stripped).
 */
const CONNECTION_STRING_PREFIXES: readonly string[] = ['MYSQLCONNSTR_', 'SQLAZURECONNSTR_', 'SQLCONNSTR_', 'POSTGRESQLCONNSTR_', 'CUSTOMCONNSTR_', 'APIHUBCONNSTR_', 'DOCDBCONNSTR_',
  'EVENTHUBCONNSTR_', 'NOTIFICATIONHUBCONNSTR_', 'REDISCACHECONNSTR_', 'SERVICEBUSCONNSTR_'];

export class EnvironmentVariablesConfigProvider extends ConfigProvider {
  readonly #source: EnvironmentVariablesConfigSource;

  public constructor(source: EnvironmentVariablesConfigSource) {
    super();
    this.#source = source;
  }

  public override load(): void {
    this.data.clear();

    const { prefix, variableNameTransformation, env } = this.#source;
    // The prefix is matched against TRANSFORMED names, so it runs through the
    // same transformation itself first.
    const transformedPrefix = prefix === undefined ? undefined : variableNameTransformation(prefix);

    for (const [rawName, value] of Object.entries(env)) {
      if (value === undefined) {
        continue;
      }

      const name = effectiveName(rawName, variableNameTransformation);

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
