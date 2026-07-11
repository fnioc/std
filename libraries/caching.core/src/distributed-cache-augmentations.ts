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
// `IDistributedCache` gets NO interface-side merge -- it is the family's
// many-implementers interface (memory today; remote providers by design), and
// a merge would force phantom members onto every hand-written implementer and
// test fake (§36/§38, the `ILogger` precedent). The method surface is typed
// per concrete class via `DistributedCacheExtensionMethods`, and the set is
// registered against the `IDistributedCache` token so every concrete class
// decorated `@augment(nameof<IDistributedCache>())` gains the method form.

import { type AbortSignal, type AugmentationSet, registerAugmentations } from "@rhombus-std/primitives";
import { nameof } from "@rhombus-std/primitives.transformer/internal/nameof";
import type { Ctor } from "@rhombus-toolkit/func";
import { DistributedCacheEntryOptions, freezeDistributedCacheEntryOptions } from "./DistributedCacheEntryOptions";
import type { IDistributedCache } from "./IDistributedCache";

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

/**
 * The method-form surface of {@link DistributedCacheExtensions}. Deliberately
 * NOT merged onto `IDistributedCache` (§36/§38: the interface has many
 * implementers by design, and a merge would force phantom members onto every
 * one). Each concrete cache class extends this interface beside its
 * `@augment(nameof<IDistributedCache>())` decoration, so the method form is
 * typed exactly where it is installed. `set` is absent -- see the exclusion at
 * the registration below.
 */
export interface DistributedCacheExtensionMethods {
  setString(
    key: string,
    value: string,
    options?: DistributedCacheEntryOptions,
    abortSignal?: AbortSignal,
  ): Promise<void>;
  getString(key: string, abortSignal?: AbortSignal): Promise<string | undefined>;
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
