// MessageLogger / ScopeLogger / LoggerInformation — the per-(provider,category)
// filter records, ported from ME.Logging's `LoggerInformation.cs`. The
// `LoggerFactory` computes a `MessageLogger[]` + `ScopeLogger[]` for each
// composite `Logger` by running every provider's `LoggerInformation` through
// `LoggerRuleSelector`; the composite consults them at log time.

import type { IExternalScopeProvider, ILogger, ILoggerProvider, LogLevel } from "@rhombus-std/logging.core";
import type { Func } from "@rhombus-toolkit/func";
import { isSupportExternalScope } from "./support-external-scope-guard";

/** The filter delegate shape: `(providerName, categoryName, level) => enabled`. */
export type LoggerFilterDelegate = Func<[string | undefined, string | undefined, LogLevel], boolean>;

/**
 * A provider's sink plus the computed filter (min level + delegate) for one
 * category — the reference `MessageLogger` readonly struct. `isEnabled` gates
 * a write before the sink is asked to log.
 */
export class MessageLogger {
  public constructor(
    public readonly logger: ILogger,
    public readonly category: string,
    public readonly providerTypeFullName: string | undefined,
    public readonly minLevel: LogLevel | undefined,
    public readonly filter: LoggerFilterDelegate | undefined,
  ) {}

  public isEnabled(level: LogLevel): boolean {
    if (this.minLevel !== undefined && level < this.minLevel) {
      return false;
    }
    if (this.filter !== undefined) {
      return this.filter(this.providerTypeFullName, this.category, level);
    }
    return true;
  }
}

/**
 * A scope target — either a provider sink that manages its own scopes, or the
 * factory's shared {@link IExternalScopeProvider} (the reference `ScopeLogger`
 * readonly struct). Exactly one of `logger` / `externalScopeProvider` is set.
 */
export class ScopeLogger {
  public constructor(
    public readonly logger: ILogger | undefined,
    public readonly externalScopeProvider: IExternalScopeProvider | undefined,
  ) {}

  public createScope<TState>(state: TState): Disposable | undefined {
    if (this.externalScopeProvider !== undefined) {
      return this.externalScopeProvider.push(state);
    }
    return this.logger!.beginScope(state);
  }
}

/**
 * One provider's participation in a category: its created sink, the category,
 * the provider's type name (for rule matching), and whether the provider
 * consumes external scope (the reference `LoggerInformation` readonly struct).
 */
export class LoggerInformation {
  public readonly logger: ILogger;
  public readonly category: string;
  public readonly providerType: string;
  public readonly externalScope: boolean;

  public constructor(provider: ILoggerProvider, category: string) {
    this.logger = provider.createLogger(category);
    this.category = category;
    // The reference keys rule matching on `provider.GetType().FullName`; this
    // platform's nearest analog is the provider constructor's name.
    this.providerType = provider.constructor.name;
    this.externalScope = isSupportExternalScope(provider);
  }
}
