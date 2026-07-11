// ISupportExternalScope, ported from ME.Logging.Abstractions'
// `ISupportExternalScope`. A logger provider implements it to accept the
// factory-supplied ambient scope source, so scopes opened on the outer
// composite logger are visible to the provider's own sinks.

import type { IExternalScopeProvider } from "./logger";

/**
 * Represents an {@link import("./logger-factory").ILoggerProvider} that is able
 * to consume external scope information. A `LoggerFactory` calls
 * {@link setScopeProvider} on each provider that implements this, handing it the
 * shared {@link IExternalScopeProvider} so the provider's sinks can enumerate
 * the ambient scopes active when a message is written.
 */
export interface ISupportExternalScope {
  /** Sets the external scope information source for the logger provider. */
  setScopeProvider(scopeProvider: IExternalScopeProvider): void;
}
