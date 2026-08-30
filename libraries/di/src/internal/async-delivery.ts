import type { Generic } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';

/** What each step of `type` carries when it asks for a stepwise sequence, absent when it asks for anything else. */
export function asyncElementType(type: Type): Type | undefined {
  const [matched, generics] = Type.bindGenerics(typefor<AsyncIterable<Generic<'E'>>>(), type);
  return matched ? generics.get('E') : undefined;
}
