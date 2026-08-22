// Fails fast at load when a second copy of this package is in the process: a
// duplicate forks `DefaultManifest`, so augmentations installed onto one
// copy's prototype never reach manifests built by the other.

import { stampSingleInstance } from '@rhombus-std/primitives';

// The bare-library `ImportMeta` type lacks `url`, so the cast supplies it.
stampSingleInstance('@rhombus-std/di.core', (import.meta as unknown as { url: string; }).url);
