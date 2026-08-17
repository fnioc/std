export { Type } from '@rhombus-std/primitives';
export type { AggregateType, ArrayType, ConstructorType, FunctionType, GenericType, GlobalType, ImportedType, IntersectionType, IServiceProvider, IterableType, NominalType, ObjectType, RawType,
  TagType, TupleType, TypeLiteralType, UnionType } from '@rhombus-std/primitives';

export * from './brands';
export * from './builder';
export * from './Errors';
export * from './Manifest';
export * from './resolver';
export * from './ServiceDescriptor';
export * from './ServiceScope';

import './augmentations';
