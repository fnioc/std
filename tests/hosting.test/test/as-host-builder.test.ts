import { MemoryConfigurationSource } from "@rhombus-std/config";
import { Host } from "@rhombus-std/hosting/internal/index";
import { expect, test } from "bun:test";

test("asHostBuilder returns a cached classic IHostBuilder view", () => {
  const appBuilder = Host.createApplicationBuilder([]);
  const hostBuilder = appBuilder.asHostBuilder();

  expect(hostBuilder).toBeDefined();
  expect(hostBuilder.properties).toBeInstanceOf(Map);
  // Lazily allocated once and reused.
  expect(appBuilder.asHostBuilder()).toBe(hostBuilder);
});

test("asHostBuilder replays accumulated configureServices onto the application builder at build time", () => {
  const appBuilder = Host.createApplicationBuilder([]);
  const hostBuilder = appBuilder.asHostBuilder();

  let replayed = false;
  hostBuilder.configureServices((_context, services) => {
    services.addValue("test:Marker", "present");
    replayed = true;
  });

  // Not applied until the application builder is built.
  expect(replayed).toBe(false);

  const host = appBuilder.build();
  expect(replayed).toBe(true);
  expect(host.services.resolve<string>("test:Marker")).toBe("present");

  host[Symbol.dispose]();
});

test("asHostBuilder replays configureAppConfiguration onto the shared configuration", () => {
  const appBuilder = Host.createApplicationBuilder([]);
  const hostBuilder = appBuilder.asHostBuilder();

  let seenDuringCompose: string | undefined;
  hostBuilder.configureAppConfiguration((_context, config) => {
    config.add(new MemoryConfigurationSource({ initialData: { "Custom:Key": "fromAdapter" } }));
    seenDuringCompose = config.build().get("Custom:Key");
  });

  const host = appBuilder.build();
  expect(seenDuringCompose).toBe("fromAdapter");

  host[Symbol.dispose]();
});

test("asHostBuilder rejects a late host-configuration change to the environment", () => {
  const appBuilder = Host.createApplicationBuilder([]);
  const hostBuilder = appBuilder.asHostBuilder();

  // The environment was already read to build the defaults, so changing it via a
  // late host-configuration callback is unsupported.
  hostBuilder.configureHostConfiguration((config) => {
    config.add(new MemoryConfigurationSource({ initialData: { environment: "Staging" } }));
  });

  expect(() => appBuilder.build()).toThrow(/environment changed/i);
});

test("HostBuilderAdapter.build is not supported", () => {
  const appBuilder = Host.createApplicationBuilder([]);
  const hostBuilder = appBuilder.asHostBuilder();
  expect(() => hostBuilder.build()).toThrow(/not supported/i);
});
