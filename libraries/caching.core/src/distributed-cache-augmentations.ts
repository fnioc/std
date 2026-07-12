// The IDistributedCache convenience wrappers, ported from
// ME.Caching.Abstractions' static `DistributedCacheExtensions` class --
// authored as the named `DistributedCacheExtensions` augmentation object
// literal (docs §28/§38), one member per reference static method,
// receiver-first.
//
// Collapsing the reference overloads (the same sync/async collapse as
// IDistributedCache itself):
//   - `Set`/`SetAsync` collapse into one Promise-returning `set` that applies
//     a shared frozen default `DistributedCacheEntryOptions` (the reference's
//     private `DefaultOptions` singleton).
//   - `SetString`/`SetStringAsync` (each twice: with and without options)
//     collapse into one `setString` with an optional `options` parameter.
//   - `GetString`/`GetStringAsync` collapse into one `getString`.
//
// The method surface is merged onto `IDistributedCache` itself via the
// `declare module './IDistributedCache'` block below -- the §36/§48 many-
// implementers carve-out is retired (§80): every receiver uses the standard
// interface merge, and each concrete cache class `extends IDistributedCache`
// beside its `@augment(nameof<IDistributedCache>())` decoration. The set is
// still registered against the `IDistributedCache` token so every decorated
// class gains the method form on its prototype at runtime.

import { type AbortSignal, type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { nameof } from '@rhombus-std/primitives.transformer/internal/nameof';
import type { Ctor } from '@rhombus-toolkit/func';
import { DistributedCacheEntryOptions, freezeDistributedCacheEntryOptions } from './DistributedCacheEntryOptions';
import type { IDistributedCache } from './IDistributedCache';

// Structural typings for the platform's UTF-8 codec globals (native in
// node/bun/deno/browsers), local to this module: the zero-ambient-types
// library program (docs §44) has no TextEncoder/TextDecoder in scope, and the
// types never surface in a public signature, so a package-local lookup beats
// widening primitives' platform surface. Through `unknown` because the
// bare-lib `typeof globalThis` genuinely lacks the properties (the abort.ts
// precedent).
interface Utf8Encoder {
  encode(input: string): Uint8Array;
}
interface Utf8Decoder {
  decode(input: Uint8Array): string;
}
const { TextEncoder, TextDecoder } = globalThis as unknown as {
  TextEncoder: Ctor<[], Utf8Encoder>;
  TextDecoder: Ctor<[], Utf8Decoder>;
};
const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();

// The reference's private static `DefaultOptions`: one shared, frozen,
// everything-unset options bag for the option-less set forms.
const defaultOptions = freezeDistributedCacheEntryOptions(new DistributedCacheEntryOptions());

/** The `DistributedCacheExtensions` augmentation set for {@link IDistributedCache} (docs §28/§38). */
export const DistributedCacheExtensions = {
  /** Sets a sequence of bytes in the cache with the specified key and default entry options. */
  set(
    cache: IDistributedCache,
    key: string,
    value: Uint8Array,
    abortSignal?: AbortSignal,
  ): Promise<void> {
    return cache.set(key, value, defaultOptions, abortSignal);
  },

  /**
   * Sets a string in the cache with the specified key, UTF-8 encoded, with
   * `options` (or the default entry options when omitted).
   */
  setString(
    cache: IDistributedCache,
    key: string,
    value: string,
    options?: DistributedCacheEntryOptions,
    abortSignal?: AbortSignal,
  ): Promise<void> {
    return cache.set(key, utf8Encoder.encode(value), options ?? defaultOptions, abortSignal);
  },

  /**
   * Gets a string from the cache with the specified key, UTF-8 decoded, or
   * `undefined` if not present.
   */
  async getString(
    cache: IDistributedCache,
    key: string,
    abortSignal?: AbortSignal,
  ): Promise<string | undefined> {
    const data = await cache.get(key, abortSignal);
    return data === undefined ? undefined : utf8Decoder.decode(data);
  },
} satisfies AugmentationSet<IDistributedCache>;

// The method-form surface merged onto {@link IDistributedCache} (docs §28/§38):
// the merge types the wrappers on the interface itself, so every
// `IDistributedCache` value carries them and each concrete cache class
// `extends IDistributedCache` beside its `@augment(nameof<IDistributedCache>())`
// decoration to declare them where they install. `set` is absent -- its name IS
// `IDistributedCache`'s own primitive, so it stays standalone-only (excluded
// from both this merge and the prototype install; see the registration below).
declare module './IDistributedCache' {
  interface IDistributedCache {
    setString(
      key: string,
      value: string,
      options?: DistributedCacheEntryOptions,
      abortSignal?: AbortSignal,
    ): Promise<void>;
    getString(key: string, abortSignal?: AbortSignal): Promise<string | undefined>;
  }
}

// The default-options `set` is a member of `DistributedCacheExtensions` (its
// standalone surface) but is deliberately NOT prototype-installed:
// IDistributedCache already declares the `set(key, value, options)` primitive
// the wrapper builds on, so installing the wrapper would overwrite the real
// implementation on each decorated class -- and the mounted thunk would then
// recurse into itself. Same exclusion precedent as caching's `tryGetValue` and
// logging's `log`. Omit it via a rest destructure (TS exempts the rest-sibling
// from unused checks).
const { set: _set, ...distributedCacheInstanceMethods } = DistributedCacheExtensions;

registerAugmentations(nameof<IDistributedCache>(), distributedCacheInstanceMethods);
