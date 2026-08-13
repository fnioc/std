import { type CtorType, type FuncType, type IntersectionType, type Token, Type } from '@rhombus-std/primitives';

export type TypeSignatures = ReadonlyArray<readonly Type[]>;
export namespace TypeSignatures {
  export function from(signatures: Signatures): TypeSignatures {
    return signatures.map(sig => sig.map(token => typeof token === 'string' ? Type.from(token) : token));
  }

  /**
   * The dependency signatures a composed implementation type describes — one
   * per call signature, in order. An intersection of constructor/function
   * types describes an overloaded implementation, one member per signature.
   *
   * @throws Error - when the type, or an intersection member, describes nothing callable.
   */
  export function fromImplType(implType: CtorType | FuncType | IntersectionType): TypeSignatures {
    if (implType.kind === 'ctor' || implType.kind === 'func') {
      return [implType.args];
    }
    return implType.members.flatMap(member => {
      if (member.kind !== 'ctor' && member.kind !== 'func' && member.kind !== 'intersection') {
        throw new Error(
          `${Type.stringify(member)} describes nothing callable; give a constructor or function `
            + 'type, or an intersection of them for an overloaded implementation.',
        );
      }
      return fromImplType(member);
    });
  }
  export function signaturesEqual(left: TypeSignatures, right: TypeSignatures): boolean {
    return left.length === right.length && left.every((signature, index) =>
      signature.length === right[index]!.length
      && signature.every((param, position) => param === right[index]![position])
    );
  }

  export function substituteSignatures(signatures: TypeSignatures,
    generics: ReadonlyMap<string, Type>): TypeSignatures {
    return signatures.map(signature => signature.map(param => Type.substitute(param, generics)));
  }
}

/** A signatures array whose entries may be a mix of resolved `Type`s and unnormalized `Token` strings. */
export type Signatures = ReadonlyArray<ReadonlyArray<Type | Token>>;
export namespace Signatures {
  /**
   * Overlays a sparse positional `overrides` array onto each derived dependency signature, so a
   * caller registering a class whose constructor it cannot edit — third-party, or generic — can pin
   * individual parameters and keep the derived ones for the rest.
   *
   * @remarks
   * A hole and an explicit `undefined` are NOT the same override. `Object.assign` copies own
   * enumerable indices: a hole is not one, so the derived parameter survives it, while an explicit
   * `undefined` is one and overwrites. `length` is own but not enumerable, so a short `overrides`
   * never truncates.
   *
   * The type layer cannot make that distinction — `[, Redis]` and `[undefined, Redis]` infer the
   * same tuple — so it reads both as "keep the derived one" and diverges from the second case.
   *
   * @example
   * ```ts
   * overrideSignatures([[A, B]], [Redis, undefined]); // → [[Redis, undefined]]
   * overrideSignatures([[A, B, C]], [, Redis]);       // → [[A, Redis, C]]
   * overrideSignatures([[A, B]], [Redis]);            // → [[Redis, B]]  — length kept
   * ```
   */
  export function overrideSignatures(signatures: Signatures,
    overrides: ReadonlyArray<Type | string | undefined>): Signatures {
    return signatures.map(signature => Object.assign(signature.slice(), overrides));
  }
}
