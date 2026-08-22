// Public entry point for @rhombus-std/primitives.

import { stampSingleInstance } from './single-instance-guard';

// The bare-library `ImportMeta` type lacks `url`, so the cast supplies it.
stampSingleInstance('@rhombus-std/primitives', (import.meta as unknown as { url: string; }).url);

export * from './augmentation';
export * from './change-token';
export type * from './IServiceProvider';
export * from './NotImplementedError';
export * from './platform';
export * from './single-instance-guard';
export * from './Type';
export * from './TypeParseError';
export * from './utils/index';
