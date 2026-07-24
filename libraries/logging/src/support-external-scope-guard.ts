// A structural check for `ISupportExternalScope`: the interface has exactly
// one member, so testing for a callable `setScopeProvider` is sufficient.

import type { ILoggerProvider, ISupportExternalScope } from '@rhombus-std/logging.core';

/** True when `provider` implements {@link ISupportExternalScope}. */
export function isSupportExternalScope(provider: ILoggerProvider): provider is ILoggerProvider & ISupportExternalScope {
  return typeof (provider as Partial<ISupportExternalScope>).setScopeProvider === 'function';
}
