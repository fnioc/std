// Public entry point for @rhombus-std/primitives.

import { stampSingleInstance } from '@rhombus-toolkit/platform';

// The bare-library `ImportMeta` type lacks `url`, so the cast supplies it.
stampSingleInstance('@rhombus-std/primitives', (import.meta as unknown as { url: string; }).url);

export * from '@rhombus-toolkit/platform';
export * from './augmentation';
export * from './change-token';
export * from './NotImplementedError';
export * from './Type';
export * from './TypeParseError';
