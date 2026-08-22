import { type Manifest } from '@rhombus-std/di.core';
import type { IOptions } from '@rhombus-std/options';
import { type IServiceProvider, Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';

import { assembleOptions } from './assemble-options.js';
import { baseFactoryType } from './option-types.js';

const hole = Type.generic('$T');

/**
 * `IOptions<$T>` left open — the one address every `IOptions<T>` request in the
 * container resolves through.
 */
const openOptionsType = Type.imported('IOptions', '@rhombus-std/options', [hole]);

/**
 * Ensures the container carries the single open `IOptions<$T>` registration,
 * appending it only the first time.
 *
 * @remarks
 * The signature reads its two holes differently, which is the whole mechanism.
 * The BARE `hole` slot delivers the type that closed the request, so the
 * implementation learns which `T` it is assembling and can find that type's
 * pipeline slots — including its change-token sources, which is what lets one
 * registration serve reload as well as snapshot. The `baseFactoryType(hole)`
 * slot is a hole inside a larger type, so it closes into a concrete slot and
 * resolves as an ordinary dependency; a `T` with no base factory registered
 * therefore leaves this registration unlowerable, and the request answers
 * `undefined`.
 */
export function ensureOpenOptions(manifest: Manifest<string>): Manifest<string> {
  return manifest.tryAdd(
    openOptionsType,
    (resolver: IServiceProvider, optionsType: Type, makeBase: Func<[], unknown>): IOptions<unknown> => assembleOptions(resolver, optionsType, makeBase),
    Type.func(openOptionsType, [[typefor<IServiceProvider>(), hole, baseFactoryType(hole)]]),
  );
}
