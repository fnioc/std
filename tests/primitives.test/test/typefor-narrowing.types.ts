import { type ArrayType, type ConstructorType, type FunctionType, type IterableType, type NamedType, type TupleType, Type, type TypeLiteralType, type UnionType } from '@rhombus-std/primitives';
import type { AbstractConstructorType } from '@rhombus-std/primitives';
import type { TypeFor } from '@rhombus-std/primitives.extras';

declare class Concrete {
  now(): string;
}
declare abstract class Base {
  abstract now(): string;
}

declare function narrows<Expected>(actual: Expected): void;

narrows<ConstructorType>(null! as TypeFor<typeof Concrete>);
narrows<AbstractConstructorType>(null! as TypeFor<typeof Base>);
narrows<FunctionType>(null! as TypeFor<(n: number) => string>);
narrows<ArrayType>(null! as TypeFor<string[]>);
narrows<TupleType>(null! as TypeFor<[string, number]>);
narrows<IterableType>(null! as TypeFor<Iterable<string>>);
narrows<NamedType>(null! as TypeFor<string>);
narrows<NamedType>(null! as TypeFor<number>);
narrows<NamedType>(null! as TypeFor<boolean>);
narrows<TypeLiteralType<'dev'>>(null! as TypeFor<'dev'>);
narrows<TypeLiteralType<42>>(null! as TypeFor<42>);
narrows<TypeLiteralType<true>>(null! as TypeFor<true>);
narrows<TypeLiteralType<undefined>>(null! as TypeFor<undefined>);
narrows<UnionType>(null! as TypeFor<'debug' | 'info'>);
narrows<UnionType>(null! as TypeFor<string | undefined>);
narrows<Type>(null! as TypeFor<{ a: string; }>);

declare const dev: TypeFor<'dev'>;
narrows<'dev'>(dev.value);
narrows<'dev'>(Type.typeLiteral('dev').value);

// The narrowing never overshoots:
// @ts-expect-error a different literal is not this one
narrows<TypeLiteralType<'dev'>>(null! as TypeFor<'prod'>);
// @ts-expect-error the value read is the literal, not another
narrows<'prod'>(dev.value);
// @ts-expect-error the wide string is a name, never a literal node
narrows<TypeLiteralType>(null! as TypeFor<string>);
// @ts-expect-error a literal union is a union node, not one literal
narrows<TypeLiteralType>(null! as TypeFor<'a' | 'b'>);
// @ts-expect-error an abstract class is not the concrete kind
narrows<ConstructorType>(null! as TypeFor<typeof Base>);
// @ts-expect-error a concrete class is not the abstract kind
narrows<AbstractConstructorType>(null! as TypeFor<typeof Concrete>);
// @ts-expect-error a class is not a function node
narrows<FunctionType>(null! as TypeFor<typeof Concrete>);
// @ts-expect-error a tuple is not the array kind
narrows<ArrayType>(null! as TypeFor<[string, number]>);
// @ts-expect-error an array is not the tuple kind
narrows<TupleType>(null! as TypeFor<string[]>);
// @ts-expect-error a wide scalar never narrows to a literal's value shape
narrows<TypeLiteralType<'dev'>>(null! as TypeFor<string>);

// Not narrower than they honestly can be:
// @ts-expect-error a Map is not exactly Iterable — it stays the whole union
narrows<IterableType>(null! as TypeFor<Map<string, number>>);
// @ts-expect-error an interface-shaped object keeps the whole union — an address is nominal
narrows<TypeLiteralType>(null! as TypeFor<object>);

type asdf = TypeFor<'asdf'>;
