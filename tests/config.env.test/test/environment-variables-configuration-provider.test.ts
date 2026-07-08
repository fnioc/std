// Behavior tests for EnvironmentVariablesConfigurationProvider -- loads an
// environment map into the ConfigurationProvider store, filtering by an
// optional prefix and mapping the conventional `__` section separator to `:`.
//
// The env map is INJECTED per test (source `env` option, #16), so load() is
// pure with respect to it: no `process.env` mutation, no shared afterEach
// cleanup dance, and reloading with a different map fully replaces the data.

import { ConfigurationBuilder } from "@rhombus-std/config";
import { describe, expect, test } from "bun:test";
import "@rhombus-std/config.env/internal/index";
import { EnvironmentVariablesConfigurationProvider } from "@rhombus-std/config.env/internal/environment-variables-configuration-provider";
import {
  colonAndDotVariableNameTransformation,
  EnvironmentVariablesConfigurationSource,
} from "@rhombus-std/config.env/internal/environment-variables-configuration-source";

type EnvMap = Record<string, string | undefined>;

function providerOf(env: EnvMap, options?: { prefix?: string; variableNameTransformation?: (name: string) => string }) {
  const provider = new EnvironmentVariablesConfigurationProvider(
    new EnvironmentVariablesConfigurationSource({ ...options, env }),
  );
  provider.load();
  return provider;
}

describe("EnvironmentVariablesConfigurationProvider with a prefix", () => {
  test("keeps only vars whose transformed name starts with the prefix and strips it", () => {
    const provider = providerOf({ "APP_Foo": "1", "OTHER_Thing": "should-not-appear" }, { prefix: "APP_" });

    expect(provider.tryGet("Foo")).toEqual([true, "1"]);
    expect(provider.tryGet("OTHER_Thing")).toEqual([false]);
    expect([...provider.getChildKeys([], undefined)].some((key) => key.includes("Other"))).toBe(false);
  });

  test("maps double underscore in the remaining name to a colon", () => {
    const provider = providerOf({ "APP_Server__Port": "8080" }, { prefix: "APP_" });
    expect(provider.tryGet("Server:Port")).toEqual([true, "8080"]);
  });

  test("prefix matching is case-insensitive", () => {
    const provider = providerOf({ "APP_Foo": "1" }, { prefix: "app_" });
    expect(provider.tryGet("Foo")).toEqual([true, "1"]);
  });

  test("passes values through unchanged", () => {
    const provider = providerOf({ "APP_Count": "0042" }, { prefix: "APP_" });
    expect(provider.tryGet("Count")).toEqual([true, "0042"]);
  });
});

describe("EnvironmentVariablesConfigurationProvider without a prefix", () => {
  test("includes all vars, still mapping double underscore to a colon", () => {
    const provider = providerOf({ "Foo": "bar", "Nested__Value": "baz" });

    expect(provider.tryGet("Foo")).toEqual([true, "bar"]);
    expect(provider.tryGet("Nested:Value")).toEqual([true, "baz"]);
  });
});

describe("EnvironmentVariablesConfigurationProvider transform-before-filter order", () => {
  test("a var whose prefix only becomes visible after __ -> : translation still matches", () => {
    const provider = providerOf({ "XFORM__Section__Foo": "matched" }, { prefix: "XFORM:Section:" });
    expect(provider.tryGet("Foo")).toEqual([true, "matched"]);
  });

  test("a custom variableNameTransformation runs before prefix matching too", () => {
    const provider = providerOf(
      { "custom-app-foo": "custom" },
      { prefix: "CUSTOM:APP:", variableNameTransformation: (name) => name.replaceAll("-", ":") },
    );
    expect(provider.tryGet("foo")).toEqual([true, "custom"]);
  });
});

describe("colonAndDotVariableNameTransformation", () => {
  test("triple underscore becomes a dot, double underscore becomes a colon", () => {
    expect(colonAndDotVariableNameTransformation("A___B__C")).toBe("A.B:C");
  });

  test("a run of four underscores is one triple plus a literal trailing underscore", () => {
    expect(colonAndDotVariableNameTransformation("A____B")).toBe("A._B");
  });

  test("usable directly as a source's variableNameTransformation", () => {
    const provider = providerOf(
      { "App___Server__Port": "8080" },
      { variableNameTransformation: colonAndDotVariableNameTransformation },
    );
    expect(provider.tryGet("App.Server:Port")).toEqual([true, "8080"]);
  });
});

describe("EnvironmentVariablesConfigurationProvider prefix normalized through the transform", () => {
  test("a raw double-underscore prefix now matches -- it's transformed like every variable name", () => {
    const provider = providerOf(
      { "Logging__LogLevel__Default": "Info" },
      { prefix: "Logging__" },
    );
    expect(provider.tryGet("LogLevel:Default")).toEqual([true, "Info"]);
  });

  test("an existing colon-form prefix keeps matching unchanged (the transform is idempotent on it)", () => {
    const provider = providerOf(
      { "Logging__LogLevel__Default": "Info" },
      { prefix: "Logging:" },
    );
    expect(provider.tryGet("LogLevel:Default")).toEqual([true, "Info"]);
  });
});

describe("EnvironmentVariablesConfigurationProvider purity w.r.t. the injected map", () => {
  test("reload with a different map reflects the new map and drops old keys", () => {
    const source = new EnvironmentVariablesConfigurationSource({ prefix: "APP_", env: { "APP_A": "1" } });
    const provider = new EnvironmentVariablesConfigurationProvider(source);
    provider.load();
    expect(provider.tryGet("A")).toEqual([true, "1"]);

    source.env = { "APP_B": "2" };
    provider.load();

    expect(provider.tryGet("A")).toEqual([false]);
    expect(provider.tryGet("B")).toEqual([true, "2"]);
  });
});

describe("addEnvironmentVariables augmentation", () => {
  test("registers an EnvironmentVariablesConfigurationSource on the builder", () => {
    const config = new ConfigurationBuilder()
      .addEnvironmentVariables({ prefix: "APP_", env: { "APP_Foo": "via-builder" } })
      .build();

    expect(config.get("Foo")).toBe("via-builder");
  });
});
