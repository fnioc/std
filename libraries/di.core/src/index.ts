export { Type } from '@rhombus-std/primitives';
export type { AggregateType, ArrayType, ConstructorType, FunctionType, GenericType, GlobalType, ImportedType, IntersectionType, IServiceProvider, IterableType, NominalType, ObjectType, RawType,
  TagType, TupleType, TypeLiteralType, UnionType } from '@rhombus-std/primitives';

// Side-effect import: a second loaded copy of this package fails fast here.
import './single-instance-guard';

export * from './brands';
export type { ServiceDescriptorBuilderFor } from './builder';
export * from './Errors';
export * from './LifetimeModel';
export * from './Manifest';
export * from './ServiceDescriptor';

import './augmentations';
