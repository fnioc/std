export { Type } from '@rhombus-std/primitives';
export type { ImportedType, NamedType } from '@rhombus-std/primitives';

// Side-effect import: a second loaded copy of this package fails fast here.
import './single-instance-guard';

export * from './brands';
export type { RegistrationBuilderFor } from './builder';
export * from './Errors';
export type { Invoker } from './Invoker';
export type * from './IServiceProvider';
export * from './LifetimeModel';
export * from './Manifest';
export * from './Registration';
export * from './ScopeFactory';

import './augmentations';
