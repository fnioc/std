import { Type } from '@rhombus-std/primitives';

/** Access to the resolve that constructed the holder, answered where the resolve-audit addon is installed. */
export interface ResolveAudit {
  /** The request that opened the resolution. */
  get request(): Type;

  /** The address of the construction holding this audit, absent when nothing constructed it. */
  get address(): Type | undefined;

  /** The address of each construction enclosing the holder, innermost first. */
  get ancestry(): Iterable<Type>;
}
