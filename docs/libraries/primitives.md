# `@rhombus-std/primitives`

Universal, zero-dependency leaf every family can depend on: the change-token trio
(`IChangeToken`, `ChangeToken.onChange`, `CompositeChangeToken`) underpinning live-reload,
the augmentation infrastructure (the registry, `@augment`, `AugmentationSet<R>` — see
`docs/features/augmentations.md`), `primitives.transformer`'s `tokenfor<T>()`/token-derivation
machinery, and the structural platform typings (`AbortSignal`, `ProcessLike`, `TimeoutHandle`,
`ReadableStream<R>`) that keep the library tier free of `lib.dom`/`@types/node`/bun-types.

## Justified divergences

None beyond the augmentation pattern — see `docs/features/augmentations.md`.
