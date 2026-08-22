// What a single `Type.ts` would have exported: the `Type` namespace and the node
// types it is written in terms of. Everything else in this directory builds one
// of those and is reached only through them.

export { Type } from './Type.js';
export type { ArrayType, ConstructorType, FunctionType, GenericType, GlobalType, ImportedType, IntersectionType, IterableType, ListType, LiteralValue, NamedType, ObjectType, TagType, TupleType,
  TypeIdentifier, TypeLiteralType, UnionType } from './Type.js';
