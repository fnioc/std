import { type AbortSignal } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { Ctor, Flatten } from '@rhombus-toolkit/types';
import { DistributedCacheEntryOptions, freezeDistributedCacheEntryOptions } from './DistributedCacheEntryOptions';
import type { IDistributedCache } from './IDistributedCache';

// Structural typings for the platform's UTF-8 codec globals (native in
// node/bun/deno/browsers), local to this module: the zero-ambient-types
// library program has no TextEncoder/TextDecoder in scope, and the types
// never surface in a public signature, so a package-local lookup beats
// widening primitives' platform surface. Cast through `unknown` because the
// bare-lib `typeof globalThis` genuinely lacks these properties.
interface Utf8Encoder {
  encode(input: string): Uint8Array;
}
interface Utf8Decoder {
  decode(input: Uint8Array): string;
}
const { TextEncoder, TextDecoder } = globalThis as unknown as { TextEncoder: Ctor<[], Utf8Encoder>; TextDecoder: Ctor<[], Utf8Decoder>; };
const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();

// One shared, frozen, everything-unset options bag for the option-less set forms.
const defaultOptions = freezeDistributedCacheEntryOptions(new DistributedCacheEntryOptions());

export namespace DistributedCacheSugarAugmentations {
  /**
   * `set` is standalone-only. Its name IS `IDistributedCache`'s own primitive, so
   * it is kept out of both the interface merge and the prototype install below --
   * mounting it would displace the real implementation on every decorated class,
   * and the mounted member would then recurse into itself.
   */
  export function set(this: IDistributedCache, key: string, value: Uint8Array, abortSignal?: AbortSignal): Promise<void> {
    return this.set(key, value, defaultOptions, abortSignal);
  }

  /**
   * Sets a string in the cache with the specified key, UTF-8 encoded, with
   * `options` (or the default entry options when omitted).
   */
  export function setString(this: IDistributedCache, key: string, value: string, options?: DistributedCacheEntryOptions, abortSignal?: AbortSignal): Promise<void> {
    return this.set(key, utf8Encoder.encode(value), options ?? defaultOptions, abortSignal);
  }

  /** Gets a string from the cache with the specified key, UTF-8 decoded, or `undefined` if not present. */
  export async function getString(this: IDistributedCache, key: string, abortSignal?: AbortSignal): Promise<string | undefined> {
    const data = await this.get(key, abortSignal);
    return data === undefined ? undefined : utf8Decoder.decode(data);
  }
}

declare module '@rhombus-std/caching.core' {
  interface IDistributedCache extends Flatten<Omit<typeof DistributedCacheSugarAugmentations, 'set'>> {}
}

// Omit the standalone-only `set` from the install via a rest destructure (TS
// exempts the rest-sibling from unused checks).
const { set: _set, ...distributedCacheInstanceMethods } = DistributedCacheSugarAugmentations;

registerAugmentations<IDistributedCache>(distributedCacheInstanceMethods);
