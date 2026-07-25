// The filtering alias marker for an ILoggerProvider: a provider class declares a
// well-known static key so its configuration rules can be keyed by a concise
// name (`"Console"`) instead of its full type name.
//
//   class ConsoleLoggerProvider implements ILoggerProvider {
//     static readonly [providerAlias] = "Console";
//   }
//
//   getProviderAlias(ConsoleLoggerProvider); // "Console"

/**
 * The well-known static key an {@link ILoggerProvider} class sets to declare its
 * filtering alias.
 */
export const providerAlias: unique symbol = Symbol('@rhombus-std/logging.core:ProviderAlias');

/** A provider class carrying the {@link providerAlias} static marker. */
export interface ProviderAliased {
  readonly [providerAlias]: string;
}

/**
 * Reads the {@link providerAlias} marker off a provider's constructor, returning
 * the alias, or `undefined` when the provider declares none.
 */
export function getProviderAlias(providerType: object): string | undefined {
  const alias = (providerType as Partial<ProviderAliased>)[providerAlias];
  return typeof alias === 'string' ? alias : undefined;
}
