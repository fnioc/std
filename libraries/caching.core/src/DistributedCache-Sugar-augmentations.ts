import { type AbortSignal, type AugmentationSet2, type Flatten, registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import type { Ctor } from '@rhombus-toolkit/func';
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
const { TextEncoder, TextDecoder } = globalThis as unknown as { TextEncoder: Ctor<[], Utf8Encoder>;
  TextDecoder: Ctor<[], Utf8Decoder>; };
const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();

// One shared, frozen, everything-unset options bag for the option-less set forms.
const defaultOptions = freezeDistributedCacheEntryOptions(new DistributedCacheEntryOptions());

type IDistributedCacheSugarAugmentations = {
  setString(key: string, value: string, options?: DistributedCacheEntryOptions,
    abortSignal?: AbortSignal): Promise<void>;
  getString(key: string, abortSignal?: AbortSignal): Promise<string | undefined>;
};

/**
 * `set` is standalone-only. Its name IS `IDistributedCache`'s own primitive, so
 * it is kept out of both the interface merge and the prototype install below --
 * mounting it would displace the real implementation on every decorated class,
 * and the mounted thunk would then recurse into itself.
 */
type IDistributedCacheStandaloneWrites = {
  set(key: string, value: Uint8Array, abortSignal?: AbortSignal): Promise<void>;
};

declare module '@rhombus-std/caching.core' {
  interface IDistributedCache extends IDistributedCacheSugarAugmentations {}
}

export const DistributedCacheSugarAugmentations: AugmentationSet2<IDistributedCache,
  Flatten<IDistributedCacheSugarAugmentations & IDistributedCacheStandaloneWrites>> = {
    /** Sets a sequence of bytes in the cache with the specified key and default entry options. */
    set(cache, key, value, abortSignal) {
      return cache.set(key, value, defaultOptions, abortSignal);
    },

    /**
     * Sets a string in the cache with the specified key, UTF-8 encoded, with
     * `options` (or the default entry options when omitted).
     */
    setString(cache, key, value, options, abortSignal) {
      return cache.set(key, utf8Encoder.encode(value), options ?? defaultOptions, abortSignal);
    },

    /** Gets a string from the cache with the specified key, UTF-8 decoded, or `undefined` if not present. */
    async getString(cache, key, abortSignal) {
      const data = await cache.get(key, abortSignal);
      return data === undefined ? undefined : utf8Decoder.decode(data);
    },
  };

// Omit the standalone-only `set` from the install via a rest destructure (TS
// exempts the rest-sibling from unused checks). The rest object is a plain
// object type rather than a mapped one, so the set's shape is named explicitly
// instead of inferred.
const { set: _set, ...distributedCacheInstanceMethods } = DistributedCacheSugarAugmentations;

registerAugmentations<IDistributedCache, Flatten<IDistributedCacheSugarAugmentations>>(
  tokenfor<IDistributedCache>(),
  distributedCacheInstanceMethods,
);
