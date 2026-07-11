// ProviderAlias — the decorator-free filtering marker (the reference
// `ProviderAliasAttribute` analog): a provider class declares a static keyed by
// the `providerAlias` symbol; `getProviderAlias` reads it back off the type.

import { NullLogger } from "@rhombus-std/logging";
import { getProviderAlias, type ILogger, type ILoggerProvider, providerAlias } from "@rhombus-std/logging.core";
import { describe, expect, test } from "bun:test";

class AliasedProvider implements ILoggerProvider {
  public static readonly [providerAlias] = "Console";

  public createLogger(_categoryName: string): ILogger {
    return NullLogger.instance;
  }

  public [Symbol.dispose](): void {}
}

class UnaliasedProvider implements ILoggerProvider {
  public createLogger(_categoryName: string): ILogger {
    return NullLogger.instance;
  }

  public [Symbol.dispose](): void {}
}

describe("getProviderAlias", () => {
  test("reads the static marker off a provider type", () => {
    expect(getProviderAlias(AliasedProvider)).toBe("Console");
  });

  test("returns undefined for a provider that declares no alias", () => {
    expect(getProviderAlias(UnaliasedProvider)).toBeUndefined();
  });

  test("the marker lives on the type, not the instance", () => {
    // The reference attribute is metadata on the provider TYPE; an instance
    // carries no alias of its own.
    expect(getProviderAlias(new AliasedProvider())).toBeUndefined();
  });
});
