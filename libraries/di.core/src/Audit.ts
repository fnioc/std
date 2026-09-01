import { Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';

/** Access to the resolve that constructed the holder, answered where the audit addon is installed. */
export interface Audit {
  /** The request that opened the resolution. */
  get request(): Type;

  /** The address of the construction holding this audit, absent when nothing constructed it. */
  get address(): Type | undefined;

  /** The address of each construction enclosing the holder, innermost first. */
  get ancestry(): Iterable<Type>;
}

export namespace Audit {
  /** The address the audit addon answers when named as a constructor dependency. */
  export const address: Type = typefor<Audit>();
}
