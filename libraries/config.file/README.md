# @rhombus-std/config.file

**The shared base layer for file-backed configuration providers.**

`@rhombus-std/config.file` holds the plumbing every file-format configuration
provider needs: reading a file through an `IFileProvider`, treating a missing
file as optional or as an error, reloading when the file changes, and routing
load failures through a handler you install once on the builder. The
JSON, INI, and XML providers all build on it, so they share identical file
semantics and only differ in how they parse the bytes.

Most applications never import this package directly — they add
`@rhombus-std/config.json` (or `.ini` / `.xml`) and get these behaviors for
free. Reach for `config.file` when you are **writing your own file-format
provider**, or when you want to set a shared base directory or load-error
handler for the file providers you already use.

## Install

```sh
bun add @rhombus-std/config.file @rhombus-std/config @rhombus-std/fileproviders.physical
```

## Builder defaults

Importing the package installs a handful of methods on the configuration
builder (and manager). Set a base directory once and every file provider added
afterward resolves its paths against it:

```ts
import { ConfigurationBuilder } from '@rhombus-std/config';
import '@rhombus-std/config.file';
import '@rhombus-std/config.json';

const config = new ConfigurationBuilder()
  .setBasePath('/etc/myapp')
  .addJsonFile('appsettings.json', { optional: true })
  .build();
```

Install a load-error handler to decide, per failure, whether to swallow the
error or let it throw:

```ts
new ConfigurationBuilder()
  .setFileLoadErrorHandler((ctx) => {
    console.warn(`could not load config: ${ctx.error}`);
    ctx.ignore = true; // swallow it; leave `ignore` false to rethrow
  })
  .addJsonFile('appsettings.json');
```

## Reloading on change

A file source can watch its file and reload when it changes. Pair a
file-format provider with a watching file provider and set `reloadOnChange`:

```ts
new ConfigurationBuilder()
  .addJsonFile('appsettings.json', { reloadOnChange: true });
```

A change coalesces through a short delay (250 ms by default, `reloadDelay`) so a
half-written file is never parsed mid-write, and a key removed from the file
disappears from configuration on the next load rather than lingering.

## Writing a file-format provider

Derive a source from `FileConfigurationSource` and a provider from
`FileConfigurationProvider`, implementing just the parse step:

```ts
import type { IConfigurationBuilder } from '@rhombus-std/config.core';
import { FileConfigurationProvider,
  FileConfigurationSource } from '@rhombus-std/config.file';

class MyConfigurationSource extends FileConfigurationSource {
  build(builder: IConfigurationBuilder) {
    this.ensureDefaults(builder);
    return new MyConfigurationProvider(this);
  }
}

class MyConfigurationProvider extends FileConfigurationProvider {
  protected loadContent(content: string): void {
    for (const [key, value] of parseMyFormat(content)) {
      this.set(key, value);
    }
  }
}
```

The base handles existence, optionality, reload, the store swap, and error
routing; your `loadContent` only turns decoded text into key/value pairs.

## Key exports

| Export                        | What it is                                                                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `FileConfigurationSource`     | Abstract source base — file provider, path, `optional`, `reloadOnChange`, `reloadDelay`, plus `ensureDefaults` / `resolveFileProvider`. |
| `FileConfigurationProvider`   | Abstract provider base — reads the file, calls your `loadContent`, reloads on change, and is disposable.                                |
| `FileLoadErrorContext`        | The value passed to a load-error handler — the `provider`, the `error`, and a settable `ignore` flag.                                   |
| `FormatError`                 | Thrown by a parser when a file's contents are malformed.                                                                                |
| `InvalidDataError`            | The base's wrapper around a parse failure, carrying the original as `cause`.                                                            |
| `FileConfigurationExtensions` | The builder methods — `setFileProvider` / `getFileProvider` / `setBasePath` / `setFileLoadErrorHandler` / `getFileLoadErrorHandler`.    |

## How it fits

`@rhombus-std/config.file` builds on
[`@rhombus-std/config`](../config/README.md) for the provider base and the
builder it augments, on
[`@rhombus-std/fileproviders.physical`](../fileproviders.physical/README.md)
for the default on-disk file provider (rooted at the current working directory
when you set no base path), and on
[`@rhombus-std/primitives`](../primitives/README.md) for the change-token
machinery behind reload.

The concrete file formats —
[`@rhombus-std/config.json`](../config.json/README.md),
`@rhombus-std/config.ini`, and `@rhombus-std/config.xml` — each derive from
this base.

## Notes

- **Synchronous reads need a physical path.** Configuration loads
  synchronously, so a file source reads its file directly off disk. A file
  provider that serves only in-memory or remote content (no physical path) is
  not supported for file configuration and raises an error on load.
- **A source with an absolute path is self-rooting.** `resolveFileProvider`
  turns an absolute file path into a provider rooted at its directory, so an
  absolute path works even without a base path set.
