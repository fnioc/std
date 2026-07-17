# @rhombus-std/config.ini

**Read configuration from INI files.**

`@rhombus-std/config.ini` adds an INI file source to
[`@rhombus-std/config`](../config/README.md). Point it at an `.ini` file and its
sections and keys flatten into the same case-insensitive configuration tree
every other source feeds, so INI values sit alongside JSON, environment, and
command-line values under one lookup.

It builds on the shared file base, so it inherits optional files, base-path
resolution, load-error handling, and reload-on-change for free — the only thing
specific to this package is the INI grammar.

## Install

```sh
bun add @rhombus-std/config.ini @rhombus-std/config
```

## Usage

```ts
import { ConfigBuilder } from '@rhombus-std/config';
import '@rhombus-std/config.ini';

const config = new ConfigBuilder()
  .addIniFile('appsettings.ini', { optional: true, reloadOnChange: true })
  .build();

config.get('Server:Host');
```

A section header becomes a key prefix, so this file:

```ini
[Server:Primary]
Host = localhost
Port = 8080
```

produces `Server:Primary:Host` = `localhost` and `Server:Primary:Port` =
`8080`.

Read an INI payload you already hold in memory with `addIniStream`:

```ts
import { ConfigBuilder } from '@rhombus-std/config';
import '@rhombus-std/config.ini';

new ConfigBuilder()
  .addIniStream('[App]\nName=demo')
  .build();
```

## Grammar

- **Sections.** `[Section:Header]` sets the prefix for the keys beneath it,
  until the next header. A key before any header takes no prefix.
- **Comments.** A line whose first non-space character is `;`, `#`, or `/` is
  ignored, as are blank lines.
- **Assignments.** `key = value`, split on the **first** `=`, with the key and
  value trimmed — so a value may itself contain `=`.
- **Quoted values.** One surrounding pair of double quotes is stripped, keeping
  any spaces inside them: `key = " value "` yields `value` with its spaces.
- **Errors.** A non-comment line with no `=`, or a duplicate key, is rejected.

## Key exports

| Export                    | What it is                                                                  |
| ------------------------- | --------------------------------------------------------------------------- |
| `IniConfigSource`         | A file source reading an INI file; `addIniFile` registers one for you.      |
| `IniConfigProvider`       | The provider `IniConfigSource` builds — reads the file and flattens it.     |
| `IniStreamConfigSource`   | A source over an in-memory INI payload; `addIniStream` registers one.       |
| `IniStreamConfigProvider` | The provider `IniStreamConfigSource` builds.                                |
| `IniConfigExtensions`     | The `addIniFile` / `addIniStream` builder methods, as standalone functions. |

## How it fits

`@rhombus-std/config.ini` builds on
[`@rhombus-std/config.file`](../config.file/README.md) for the file source and
provider bases (and everything they bring — optional files, base paths, reload)
and on [`@rhombus-std/config`](../config/README.md) for the builder it augments
and the stream source base. It is a sibling of
[`@rhombus-std/config.json`](../config.json/README.md) and
`@rhombus-std/config.xml`.

## Notes

- **`addIniFile` and `addIniStream` install on both the builder and the
  manager.** Importing the package once makes them available on
  `ConfigBuilder` and `ConfigManager` alike.
- **Reload needs a watching file provider.** `reloadOnChange: true` reacts to
  file changes when the backing file provider supports watching (the default
  on-disk provider does); see
  [`@rhombus-std/config.file`](../config.file/README.md) for details.
