// Side-effect import: a second loaded copy of this package fails fast here.
import './single-instance-guard';

export type * from './Addon';
export type * from './Behavior';
export * from './brands';
export type { RegistrationBuilderFor } from './builder';
export type * from './ControlService';
export * from './Errors';
export * from './hooks';
export type { Invoker } from './Invoker';
export type * from './IServiceProvider';
export type * from './IServiceScopeFactory';
export type * from './ITaggedServiceScopeFactory';
export type * from './LifetimeArgument';
export * from './Manifest';
export type * from './Middleware';
export * from './Registration';
export * from './Request';
export type * from './StandardLifetime';

import './augmentations';
