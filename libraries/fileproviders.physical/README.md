# @rhombus-std/fileproviders.physical

**A file provider backed by the real filesystem.**

`@rhombus-std/fileproviders.physical` serves files and directories straight
off the on-disk filesystem through the standard `IFileProvider` shape, so the
rest of your code looks files up the same way whether they live on disk, in a
composite, or behind a null provider. A provider is rooted at a single
absolute directory and never lets a lookup escape it, and it can watch
individual files or whole directory subtrees for changes.

## Install

```sh
bun add @rhombus-std/fileproviders.physical @rhombus-std/fileproviders.core @rhombus-std/primitives
```

## Usage

Point a provider at an absolute root directory, then look files up by a path
relative to that root:

```ts
import { PhysicalFileProvider } from '@rhombus-std/fileproviders.physical';

const provider = new PhysicalFileProvider('/srv/app/content');

const info = provider.getFileInfo('config/app.json');
if (info.exists) {
  console.log(info.physicalPath, info.length, info.lastModified);
}
```

The root must be absolute — a relative path throws. Every lookup stays inside
the root: an absolute subpath, or one that climbs out with `..`, comes back as
a not-found result rather than reaching the real file. Leading slashes are
tolerated and treated as relative to the root, so `getFileInfo('/etc/passwd')`
looks under the root, never at the system file.

`getFileInfo` never throws for a missing file — check `exists` first, then
trust the rest. Read a file's bytes with `createReadStream`, which hands back
a web `ReadableStream`:

```ts
const info = provider.getFileInfo('README.md');
const stream = info.createReadStream();
// Consume or cancel the stream when you're done -- it holds an open file
// descriptor until it is drained or cancelled.
```

List a directory with `getDirectoryContents`, which is iterable and yields an
`IFileInfo` per child. Iterating a directory that doesn't exist simply yields
nothing:

```ts
for (const entry of provider.getDirectoryContents('config')) {
  console.log(entry.name, entry.isDirectory);
}
```

### Watching for changes

`watch` returns a single-shot change token for a target. Because a token fires
at most once, the idiomatic way to react repeatedly is `ChangeToken.onChange`,
which re-arms by calling your producer again after every change:

```ts
import { ChangeToken } from '@rhombus-std/primitives';

// An exact file: fires when config/app.json is created, changed, or deleted.
ChangeToken.onChange(
  () => provider.watch('config/app.json'),
  () => reloadConfig(),
);

// A directory prefix (note the trailing slash): fires on any change in the
// config/ subtree.
ChangeToken.onChange(
  () => provider.watch('config/'),
  () => reloadConfig(),
);
```

A filter is either an exact file path or a directory path ending in a
separator. A filter that is absolute or points outside the root hands back a
no-op token that never fires. Glob patterns are not supported — a filter
containing `*` throws.

By default a provider watches through the operating system's file-watch
facility. On filesystems where that's unreliable (network mounts, some
container setups), switch to polling by setting the
`RHOMBUS_STD_USE_POLLING_FILE_WATCHER` environment variable to `1` or `true`,
or by assigning `provider.usePollingFileWatcher = true` before the first
`watch`. A polling token re-checks its target on a four-second interval;
`useActivePolling` additionally drives its callbacks, and without it you poll
the token's `hasChanged` yourself.

### Excluding files

By default a provider hides dot-prefixed entries (`.env`, `.git`, …) from both
lookups and directory listings. Pass an `ExclusionFilters` value to change
that:

```ts
import { ExclusionFilters,
  PhysicalFileProvider } from '@rhombus-std/fileproviders.physical';

// See everything, including dotfiles.
const provider = new PhysicalFileProvider('/srv/app/content',
  ExclusionFilters.None);
```

## Key exports

| Export                      | What it is                                                                                                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PhysicalFileProvider`      | An `IFileProvider` over one absolute root directory: `getFileInfo`, `getDirectoryContents`, `watch`, and a `Symbol.dispose` that closes its watchers.             |
| `PhysicalFileInfo`          | An `IFileInfo` for a single on-disk file — `exists`, `length`, `name`, `physicalPath`, `lastModified`, `isDirectory: false`, plus `createReadStream()`.           |
| `PhysicalDirectoryInfo`     | An `IFileInfo` **and** `IDirectoryContents` for a directory — `length: -1`, `isDirectory: true`, `createReadStream()` throws, and iterates its filtered children. |
| `PhysicalDirectoryContents` | The `IDirectoryContents` returned by `getDirectoryContents` — an `exists` flag and an iterator over the directory's children.                                     |
| `ExclusionFilters`          | A bitflag set — `None`, `DotPrefixed`, `Hidden`, `System`, and `Sensitive` (the default). Combine values with `\|`.                                               |

## How it fits

`@rhombus-std/fileproviders.physical` builds on
[`@rhombus-std/fileproviders.core`](../fileproviders.core/README.md) for the
`IFileProvider`/`IFileInfo`/`IDirectoryContents` interfaces and its not-found
helpers, and on [`@rhombus-std/primitives`](../primitives/README.md) for the
change-token machinery `watch` returns and the platform typings it reads the
filesystem through.

Fold it together with other providers using
[`@rhombus-std/fileproviders.composite`](../fileproviders.composite/README.md)
— for example, layering a writable content directory over a bundled default
set behind one lookup surface.

## Notes

- **`Hidden` and `System` filters are no-ops on this platform.** POSIX
  filesystems have no hidden/system attributes, so only `DotPrefixed` is
  actually enforced; the other two bits are kept for surface completeness.
- **Directory watching is best-effort; polling is the reliable path.**
  Recursive operating-system watches are unreliable on some platforms — turn
  on polling (above) when you need dependable subtree change detection.
- **Change tokens may not fire after `dispose`.** Disposing a provider closes
  its watchers and stops its polling timer; any outstanding tokens are
  abandoned rather than force-fired.
- **Exclusion filters carry through the whole tree.** A directory you reach by
  iterating `getDirectoryContents` applies the same filters to its own
  children.
