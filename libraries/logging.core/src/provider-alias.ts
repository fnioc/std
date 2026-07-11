// ProviderAlias — the filtering alias marker for an ILoggerProvider, ported
// from ME.Logging.Abstractions' `ProviderAliasAttribute`.
//
// The reference is a class attribute (`[ProviderAlias("Console")]`) read back by
// the filter machinery via reflection, giving a provider's configuration rules a
// second, more concise section name alongside the provider's full type name. TS
// has no attributes, and the repo reserves its one decorator (`@augment`) for
// runtime prototype installation — a pure-metadata attribute should not
// masquerade as that. So this is the decorator-free analog: a well-known static
// marker a provider class declares, read back by {@link getProviderAlias}. It
// mirrors the reference exactly — metadata attached to the provider TYPE (its
// constructor), not to instances — and needs no registry.
//
//   class ConsoleLoggerProvider implements ILoggerProvider {
//     static readonly [providerAlias] = "Console";
//     // ...
//   }
//
//   getProviderAlias(ConsoleLoggerProvider); // "Console"

/**
 * The well-known static key an {@link ILoggerProvider} class sets to declare its
 * filtering alias — the decorator-free stand-in for the reference
 * `[ProviderAlias(alias)]` class attribute.
 */
export const providerAlias: unique symbol = Symbol('@rhombus-std/logging.core:ProviderAlias');

/** A provider class carrying the {@link providerAlias} static marker. */
export interface ProviderAliased {
  readonly [providerAlias]: string;
}

/**
 * Reads the {@link providerAlias} marker off a provider's constructor, returning
 * the alias, or `undefined` when the provider declares none. The reference
 * `GetCustomAttribute<ProviderAliasAttribute>()?.Alias` analog.
 */
export function getProviderAlias(providerType: object): string | undefined {
  const alias = (providerType as Partial<ProviderAliased>)[providerAlias];
  return typeof alias === 'string' ? alias : undefined;
}
