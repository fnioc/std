// `set` applies a shared frozen default `DistributedCacheEntryOptions`
// singleton. `setString`/`getString` each collapse an options-optional,
// sync/async pair into one signature.

import { type AbortSignal, type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
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

/** The `DistributedCacheExtensions` augmentation set for {@link IDistributedCache}. */
export const DistributedCacheExtensions = {
  /** Sets a sequence of bytes in the cache with the specified key and default entry options. */
  set(cache: IDistributedCache, key: string, value: Uint8Array, abortSignal?: AbortSignal): Promise<void> {
    return cache.set(key, value, defaultOptions, abortSignal);
  },

  /**
   * Sets a string in the cache with the specified key, UTF-8 encoded, with
   * `options` (or the default entry options when omitted).
   */
  setString(cache: IDistributedCache, key: string, value: string, options?: DistributedCacheEntryOptions,
    abortSignal?: AbortSignal): Promise<void>
  {
    return cache.set(key, utf8Encoder.encode(value), options ?? defaultOptions, abortSignal);
  },

  /**
   * Gets a string from the cache with the specified key, UTF-8 decoded, or
   * `undefined` if not present.
   */
  async getString(cache: IDistributedCache, key: string, abortSignal?: AbortSignal): Promise<string | undefined> {
    const data = await cache.get(key, abortSignal);
    return data === undefined ? undefined : utf8Decoder.decode(data);
  },
} satisfies AugmentationSet<IDistributedCache>;

// `set` is absent here -- its name IS `IDistributedCache`'s own primitive,
// so it stays standalone-only (excluded from both this merge and the
// prototype install; see the registration below).
declare module './IDistributedCache' {
  interface IDistributedCache {
    setString(key: string, value: string, options?: DistributedCacheEntryOptions,
      abortSignal?: AbortSignal): Promise<void>;
    getString(key: string, abortSignal?: AbortSignal): Promise<string | undefined>;
  }
}

// `set` is a member of `DistributedCacheExtensions` (its standalone surface)
// but is deliberately NOT prototype-installed: IDistributedCache already
// declares the `set(key, value, options)` primitive this wrapper builds on,
// so installing it would overwrite the real implementation on each decorated
// class -- and the mounted thunk would then recurse into itself. Omit it via
// a rest destructure (TS exempts the rest-sibling from unused checks).
const { set: _set, ...distributedCacheInstanceMethods } = DistributedCacheExtensions;

registerAugmentations(tokenfor<IDistributedCache>(), distributedCacheInstanceMethods);
