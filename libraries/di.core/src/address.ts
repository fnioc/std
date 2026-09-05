import { Type } from '@rhombus-std/primitives';

/**
 * The address a registration is filed under: the type itself, or the type wearing `key` when
 * one is given.
 *
 * @throws Error - when a key is given for a type that already carries a tag, since a type wears at
 * most one and re-keying it would file the registration somewhere neither side named.
 */
export function withKey(address: Type, key: string | undefined): Type {
  if (key === undefined) {
    return address;
  }
  if (address.kind === 'tag') {
    throw new Error(`${address} already carries a tag; it cannot take the key ${key}.`);
  }
  return Type.tag(address, key);
}
