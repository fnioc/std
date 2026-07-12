# @rhombus-std/fileproviders.core

**A read-only file-provider abstraction — one interface to look up files and
directories, whatever's actually backing them.**

`IFileProvider` gives your code a single shape for "find this file" and
"list this directory" without committing to disk, an in-memory blob store, a
bundled asset set, or anything else at the call site. This package is the
contract only — interfaces plus a small set of null-object helpers for "there
is nothing here." Pair it with a concrete provider for a working
implementation.

## Install

```sh
bun add @rhombus-std/fileproviders.core
```

## Usage

Accept `IFileProvider` in your own code and it works with whatever concrete
provider a caller passes in:

```ts
import type { IFileProvider } from '@rhombus-std/fileproviders.core';

function readTemplate(provider: IFileProvider, name: string): string {
  const info = provider.getFileInfo(`templates/${name}`);
  if (!info.exists) {
    throw new Error(`template not found: ${name}`);
  }
  return info.physicalPath ?? name;
}
```

`getFileInfo` never throws for a missing file — it returns an `IFileInfo`
whose `exists` is `false`. Always check `exists` before trusting the rest of
the result.

When you have no real provider to hand — a default parameter, a test double,
an "off" switch — reach for `NullFileProvider`:

```ts
import { NullFileProvider } from '@rhombus-std/fileproviders.core';

const provider = new NullFileProvider();
provider.getFileInfo('anything').exists; // false, always
```

## Key exports

| Export                      | What it is                                                                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `IFileProvider`             | The core abstraction: `getFileInfo(subpath)`, `getDirectoryContents(subpath)`, `watch(filter)`.                                              |
| `IFileInfo`                 | A single file or directory's metadata (`exists`, `length`, `name`, `physicalPath`, `lastModified`, `isDirectory`) plus `createReadStream()`. |
| `IDirectoryContents`        | An `Iterable<IFileInfo>` with an `exists` flag — iterating a nonexistent directory yields nothing.                                           |
| `NullFileProvider`          | An `IFileProvider` with no contents — every lookup misses, `watch` monitors nothing. Useful as a default or a test double.                   |
| `NotFoundFileInfo`          | An `IFileInfo` for a file that doesn't exist — `exists: false`, `length: -1`, `createReadStream()` throws.                                   |
| `NotFoundDirectoryContents` | An `IDirectoryContents` for a directory that doesn't exist — `exists: false`, iterates as empty. Exposes a shared `.singleton`.              |
| `NullChangeToken`           | An `IChangeToken` that never fires — `watch()`'s return value when there's nothing to watch. Exposes a shared `.singleton`.                  |

## How it fits

`@rhombus-std/fileproviders.core` is the abstractions layer only — it has no
disk access, no bundling, and ships no concrete provider backed by a real
filesystem. It depends on
[`@rhombus-std/primitives`](../primitives/README.md) for the `IChangeToken`
type that `watch()` returns.

[`@rhombus-std/fileproviders.composite`](../fileproviders.composite/README.md)
builds on top of it: it folds any number of `IFileProvider` instances into
one, trying each in order and merging their change tokens into a single
watch.

## Notes

There is no disk-backed provider in this family yet — install
`fileproviders.core` for the contract and bring your own concrete
`IFileProvider` (or wait for a physical provider to land) if you need one
backed by a real filesystem.
