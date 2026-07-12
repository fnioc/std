# @rhombus-std/fileproviders.composite

**Fold several file providers into one.**

`@rhombus-std/fileproviders.composite` gives you a single `IFileProvider`
that looks across a list of providers — trying each in the order you
registered them — so the rest of your code never has to know how many
sources are actually behind a path. It's the tool for layering an override
directory over a bundled default set, or merging several logical roots into
one lookup surface.

## Install

```sh
bun add @rhombus-std/fileproviders.composite @rhombus-std/fileproviders.core @rhombus-std/primitives
```

## Usage

```ts
import { CompositeFileProvider } from '@rhombus-std/fileproviders.composite';

const provider = new CompositeFileProvider(overridesProvider, defaultsProvider);

const file = provider.getFileInfo('app.config.json');
// checks overridesProvider first, falls back to defaultsProvider
```

`CompositeFileProvider` takes any number of `IFileProvider` instances as
constructor arguments — in the order you want them tried. `getFileInfo`
returns the first one that reports `exists`; if none does, you get a
not-found `IFileInfo` back, never a thrown error.

## Key exports

| Export                       | What it is                                                                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CompositeFileProvider`      | An `IFileProvider` that composes N providers, trying each in registration order. Exposes the underlying list via `.fileProviders`.                    |
| `CompositeDirectoryContents` | An `IDirectoryContents` that merges `getDirectoryContents` results across the composed providers, de-duplicating files by name (first provider wins). |

### Directory listings

`getDirectoryContents` returns a `CompositeDirectoryContents` that lazily
merges the subpath across every composed provider the first time you iterate
or check `.exists`:

```ts
const contents = provider.getDirectoryContents('templates');

contents.exists; // true if any composed provider has something at "templates"

for (const file of contents) {
  // each file appears once, even if multiple providers expose the same name
}
```

### Watching for changes

`watch(pattern)` asks every composed provider for its own change token and
merges them into one. If nothing responds to the pattern you get a no-op
token back; if exactly one provider responds you get its token directly; if
several do, you get a single token that fires when _any_ of them does:

```ts
const token = provider.watch('**/*.json');
token.onChange(() => {
  // fires when a matching file changes in any composed provider
});
```

## How it fits

`@rhombus-std/fileproviders.composite` builds on
[`@rhombus-std/fileproviders.core`](../fileproviders.core/README.md) for the
`IFileProvider`/`IFileInfo`/`IDirectoryContents` interfaces and the
not-found helpers, and on
[`@rhombus-std/primitives`](../primitives/README.md) for the change-token
machinery (`CompositeChangeToken`) that powers `watch`. It has no runtime
dependents in this family today — reach for it directly whenever your own
code needs to treat several file sources as one.

## Notes

- Composition happens once, at construction time. If you need to add or
  remove providers later, build a new `CompositeFileProvider` rather than
  mutating the list — `.fileProviders` is read-only.
- `CompositeDirectoryContents` initializes its merged file/directory lists
  lazily and caches them — each instance reflects the state of its
  composed providers at first access, not on every iteration.
