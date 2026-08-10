import type { CtorType, FunctionType, IntersectionType, NamedType, ObjectType, PlaceholderType, TagType, TupleType,
  Type, TypeLiteralType, UnionType } from './Type.js';
import { TypeVisitor } from './TypeVisitor.js';

type Predicate = (other: Type) => boolean;

/**
 * Structural equality of two type expressions.
 *
 * @remarks
 * Exact, so member order is significant — `A | B` does not equal `B | A`. Use
 * {@link satisfiesType} in both directions for the order-insensitive relation.
 *
 * Every node is compared by reference first, so a shared subtree costs one comparison
 * instead of a walk.
 */
class EqualsVisitor extends TypeVisitor<Predicate> {
  protected override visitUnion(type: UnionType): Predicate {
    return other =>
      other === type
      || (other.kind === 'union'
        && other.types.length === type.types.length
        && type.types.every((member, index) => this.visit(member)(other.types[index]!)));
  }

  protected override visitIntersection(type: IntersectionType): Predicate {
    return other =>
      other === type
      || (other.kind === 'intersection'
        && other.types.length === type.types.length
        && type.types.every((member, index) => this.visit(member)(other.types[index]!)));
  }

  protected override visitTuple(type: TupleType): Predicate {
    return other =>
      other === type
      || (other.kind === 'tuple'
        && other.types.length === type.types.length
        && type.types.every((member, index) => this.visit(member)(other.types[index]!)));
  }

  protected override visitFunction(type: FunctionType): Predicate {
    return other =>
      other === type
      || (other.kind === 'function'
        && other.args.length === type.args.length
        && type.args.every((arg, index) => this.visit(arg)(other.args[index]!))
        && this.visit(type.returnType)(other.returnType));
  }

  protected override visitCtor(type: CtorType): Predicate {
    return other =>
      other === type
      || (other.kind === 'ctor'
        && other.args.length === type.args.length
        && type.args.every((arg, index) => this.visit(arg)(other.args[index]!))
        && this.visit(type.instanceType)(other.instanceType));
  }

  protected override visitNamed(type: NamedType): Predicate {
    return other =>
      other === type
      || (other.kind === 'named'
        && other.from === type.from
        && other.name === type.name
        && other.genericTypes.length === type.genericTypes.length
        && type.genericTypes.every((arg, index) => this.visit(arg)(other.genericTypes[index]!)));
  }

  protected override visitObject(type: ObjectType): Predicate {
    return other => {
      if (other === type) {
        return true;
      }
      if (other.kind !== 'object') {
        return false;
      }
      const keys = Object.keys(type.members);
      return keys.length === Object.keys(other.members).length
        && keys.every(key => key in other.members && this.visit(type.members[key]!)(other.members[key]!));
    };
  }

  protected override visitTypeLiteral(type: TypeLiteralType): Predicate {
    return other => other === type || (other.kind === 'literal' && Object.is(other.value, type.value));
  }

  protected override visitPlaceholder(type: PlaceholderType): Predicate {
    return other => other === type || (other.kind === 'placeholder' && other.label === type.label);
  }

  protected override visitTag(type: TagType): Predicate {
    return other =>
      other === type
      || (other.kind === 'tag' && other.tag === type.tag && this.visit(type.type)(other.type));
  }
}

const equalsVisitor = new EqualsVisitor();

export function typeEquals(left: Type, right: Type): boolean {
  return equalsVisitor.visit(left)(right);
}
