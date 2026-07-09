// The augmentation-registry token for di.core's OPEN augmentation-target
// receiver, `ServiceManifest` (docs/decisions.md §38). Distinct from the DI-slot
// tokens in `tokens.ts` (which key container registrations): this string keys the
// primitives augmentation registry's bag for the `ServiceManifest` receiver, so
// every cross-package extender (`options.augmentations`, `logging`, `diagnostics`,
// `hosting`, `caching.memory`, di's own `build`) registers its augmentation set
// against the same token and the `ServiceManifestClass` decorated with it pulls
// them onto its prototype.
//
// The value is a plain `nameof`-format string (`<package>:<TypeName>`); the
// transformer's `nameof<ServiceManifest>()` derives the identical literal, so the
// hand-written and sugar forms agree.

import type { Token } from "./types.js";

/** Registry token for the `ServiceManifest` augmentation receiver. */
export const SERVICE_MANIFEST_AUGMENTATION_TOKEN: Token = "@rhombus-std/di.core:ServiceManifest";
