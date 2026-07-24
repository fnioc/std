import type { IExternalScopeProvider } from './ILogger';

/**
 * Represents an {@link import("./logger-factory").ILoggerProvider} that is able
 * to consume external scope information. A `LoggerFactory` calls
 * {@link setScopeProvider} on each provider that implements this, handing it the
 * shared {@link IExternalScopeProvider} so the provider's sinks can enumerate
 * the ambient scopes active when a message is written.
 */
export interface ISupportExternalScope {
  setScopeProvider(scopeProvider: IExternalScopeProvider): void;
}
