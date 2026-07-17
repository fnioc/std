# `@rhombus-std/fileproviders`

`fileproviders.core` (`IFileProvider`/`IFileInfo`/`IDirectoryContents`, `NullFileProvider`) ←
`fileproviders.composite` (`CompositeFileProvider` fan-out over 0/1/N inner providers, `watch`
merging change tokens from every emitting provider) ← `fileproviders.physical` (a disk-backed
provider: `ExclusionFilters`, and a `watch` limited to exact-file / directory-prefix targets —
polling by default, since recursive `fs.watch` is unreliable on this repo's platform target).

## Justified divergences

None beyond the augmentation pattern — see `docs/features/augmentations.md`.
