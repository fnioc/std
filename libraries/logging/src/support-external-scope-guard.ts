// The `provider is ISupportExternalScope` runtime check the reference expresses
// as a C# pattern match (`provider is ISupportExternalScope supports`). The
// interface has one member, so a structural probe for a callable
// `setScopeProvider` is faithful.

import type { ILoggerProvider, ISupportExternalScope } from '@rhombus-std/logging.core';

/** True when `provider` implements {@link ISupportExternalScope}. */
export function isSupportExternalScope(
  provider: ILoggerProvider,
): provider is ILoggerProvider & ISupportExternalScope {
  return typeof (provider as Partial<ISupportExternalScope>).setScopeProvider === 'function';
}
