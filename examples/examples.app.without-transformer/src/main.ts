// The without-transformer composition root — the SAME integrated scenario as
// ../examples.app.with-transformer, wired by hand with plain `tsc`. Every
// registration and resolution names an explicit string token; the token strings
// are spelled exactly as `@rhombus-std/di.transformer` derives them for the
// package-public contracts, which is what lets THIS app resolve the built
// with-transformer library's lowered factory (its baked-in tokens agree with
// these). Diff this file against the with-transformer app's main.ts and the only
// difference is the authoring dialect — the scenario, and the output, are the
// same.
//
// The interop matrix in one file: this manual app consumes the with-transformer
// library's FormalGreeting + report factory + async banner AND the
// without-transformer library's manual registration function — each dialect
// producing and consuming the other.
//
// BOOTS VIA THE GENERIC HOST (@rhombus-std/hosting): the container above is
// registered onto the host's own `ServiceManifest`, and the scenario itself
// runs inside a hosted worker (`InteropWorker`) that implements
// `IHostedLifecycleService` and logs its ordered lifecycle callbacks through an
// injected `ILogger` — mirroring the canonical worker+lifecycle sample in
// tests/hosting.test/test/index.test.ts. The worker calls
// `IHostApplicationLifetime.stopApplication()` once its work is done, so
// `runAsync` returns deterministically with no reliance on Ctrl+C / signals.

import { ConfigurationBuilder } from "@rhombus-std/config";
import type { ConfigurationRoot } from "@rhombus-std/config";
import { RESOLVER_TOKEN } from "@rhombus-std/di";
import type { Resolver } from "@rhombus-std/di";
import { Host, HOST_APPLICATION_LIFETIME_TOKEN } from "@rhombus-std/hosting";
import type { IHostApplicationLifetime, IHostedLifecycleService } from "@rhombus-std/hosting";
import { LOGGER_FACTORY_TOKEN } from "@rhombus-std/logging";
import type { ILogger, ILoggerFactory } from "@rhombus-std/logging.core";
import { logInformation } from "@rhombus-std/logging.core";
import type { ConfigureOptions, PostConfigureOptions, ValidateOptions } from "@rhombus-std/options";
import { Options, OptionsFactory, ValidateOptionsResult } from "@rhombus-std/options";
import { ConfigurationConfigureOptions } from "@rhombus-std/options.augmentations";

import type { GreetingPolicy, IBanner, IServerReport, ServerOptions } from "@rhombus-std/examples.contracts";
import { fetchBanner, FormalGreeting, makeServerReport } from "@rhombus-std/examples.lib.with-transformer";
import { addCasualServices, GREETING_TOKEN } from "@rhombus-std/examples.lib.without-transformer";

// The tokens the transformer would derive, hand-written. GREETING_TOKEN is
// re-used from the without-transformer library so both greetings register at the
// one shared element token; the rest follow the same `<import-specifier>:<name>`
// / closed-generic `base<arg>` grammar. CONFIG_TOKEN has no transformer-derived
// counterpart to match — it exists purely to thread the manually-built
// `ConfigurationRoot` into the hosted worker below.
const BANNER_TOKEN = "Promise<@rhombus-std/examples.contracts:IBanner>";
const REPORT_TOKEN = "@rhombus-std/examples.contracts:IServerReport";
const SERVER_OPTIONS_TOKEN = "@rhombus-std/options:Options<@rhombus-std/examples.contracts:ServerOptions>";
const POLICY_TOKEN = "@rhombus-std/examples.contracts:GreetingPolicy";
const POLICY_OPTIONS_TOKEN = "@rhombus-std/options:Options<@rhombus-std/examples.contracts:GreetingPolicy>";
const CONFIG_TOKEN = "@rhombus-std/config:ConfigurationRoot";

// ── config ───────────────────────────────────────────────────────────────────

/** The layered configuration root — an in-memory source seeds the server keys. */
function buildConfig(): ConfigurationRoot {
  return new ConfigurationBuilder()
    .addInMemoryCollection({
      "Server:Host": "0.0.0.0",
      "Server:Port": "8080",
      "Server:MaxConnections": "100",
    })
    .build() as unknown as ConfigurationRoot;
}

/**
 * Assembles the reactive `Options<ServerOptions>`: the full OptionsFactory
 * pipeline (config-bind configure → coercion post-configure → range validate)
 * wrapped in `Options.watch` over the config's reload token. Token-free, so it is
 * identical to the with-transformer app's assembly.
 */
function makeServerOptions(config: ConfigurationRoot): Options<ServerOptions> {
  const bindConfig: ConfigureOptions<ServerOptions> = new ConfigurationConfigureOptions<ServerOptions>(
    config.getSection("Server"),
  );
  const coerce: PostConfigureOptions<ServerOptions> = {
    postConfigure(options: ServerOptions): void {
      options.Port = Number(options.Port);
      options.MaxConnections = Number(options.MaxConnections);
    },
  };
  const validate: ValidateOptions<ServerOptions> = {
    validate(options: ServerOptions): ValidateOptionsResult {
      if (options.Port > 0 && options.MaxConnections > 0) {
        return ValidateOptionsResult.success;
      }
      return ValidateOptionsResult.fail("Port and MaxConnections must be positive");
    },
  };
  const build = (): ServerOptions =>
    new OptionsFactory<ServerOptions>(
      () => ({ Host: "", Port: 0, MaxConnections: 0 }),
      [bindConfig],
      [coerce],
      [validate],
    ).create();
  return Options.watch(build, () => config.getReloadToken());
}

// ── the hosted worker ───────────────────────────────────────────────────────

/**
 * Runs the interop scenario once the host has started, then requests a
 * graceful shutdown so `runAsync` returns deterministically. Implements
 * `IHostedLifecycleService` and logs each ordered callback
 * (starting → start → started, then stopping → stop → stopped) through an
 * injected `ILogger` — mirroring the canonical worker+lifecycle sample.
 */
class InteropWorker implements IHostedLifecycleService {
  readonly #resolver: Resolver;
  readonly #lifetime: IHostApplicationLifetime;
  readonly #logger: ILogger;
  readonly #config: ConfigurationRoot;

  public constructor(
    resolver: Resolver,
    lifetime: IHostApplicationLifetime,
    loggerFactory: ILoggerFactory,
    config: ConfigurationRoot,
  ) {
    this.#resolver = resolver;
    this.#lifetime = lifetime;
    this.#logger = loggerFactory.createLogger("Rhombus.Examples.InteropWorker");
    this.#config = config;
  }

  public starting(): Promise<void> {
    logInformation(this.#logger, "starting");
    return Promise.resolve();
  }

  public async start(): Promise<void> {
    logInformation(this.#logger, "start");

    const report = this.#resolver.resolve<IServerReport>(REPORT_TOKEN);
    const banner = await this.#resolver.resolveAsync<IBanner>(BANNER_TOKEN);

    const optionsView = this.#resolver.resolve<Options<ServerOptions>>(SERVER_OPTIONS_TOKEN);
    const updates: string[] = [];
    const subscription = optionsView.subscribe!((next: ServerOptions) => {
      updates.push(`  reload fired: MaxConnections is now ${next.MaxConnections}`);
    });
    const before = optionsView.value.MaxConnections;
    this.#config.set("Server:MaxConnections", "250");
    this.#config.reload();
    const after = optionsView.value.MaxConnections;
    subscription[Symbol.dispose]();

    const lines = [
      "=== @rhombus-std interop — without transformer ===",
      `async banner (resolveAsync): ${banner.text}`,
      ...report.lines,
      "live reload (config → reactive Options):",
      `  MaxConnections before reload: ${before}`,
      ...updates,
      `  MaxConnections after reload: ${after}`,
    ];

    for (const line of lines) {
      console.log(line);
    }
  }

  public started(): Promise<void> {
    logInformation(this.#logger, "started");
    this.#lifetime.stopApplication();
    return Promise.resolve();
  }

  public stopping(): Promise<void> {
    logInformation(this.#logger, "stopping");
    return Promise.resolve();
  }

  public stop(): Promise<void> {
    logInformation(this.#logger, "stop");
    return Promise.resolve();
  }

  public stopped(): Promise<void> {
    logInformation(this.#logger, "stopped");
    return Promise.resolve();
  }
}

// ── host + container (all registrations explicit-token) ────────────────────

const config = buildConfig();
const serverOptions = makeServerOptions(config);

const builder = Host.createApplicationBuilder();
const services = builder.services;

// The with-transformer library's greeting at the shared token, plus the
// without-transformer library's greeting + health check via its manual function.
services.add(GREETING_TOKEN, FormalGreeting, [[]]).as("singleton");
addCasualServices(services);

// The async banner and the report factory, both from the built with-transformer
// library — the report factory takes the injected provider (RESOLVER_TOKEN slot).
services.addFactory(BANNER_TOKEN, fetchBanner, [[]]).as("singleton");
services.addFactory(REPORT_TOKEN, makeServerReport, [[RESOLVER_TOKEN]]).as("singleton");

// The reactive server options — one shared live instance.
services.addValue(SERVER_OPTIONS_TOKEN, serverOptions);

// A config-independent policy, wrapped as a static Options<GreetingPolicy> via
// the augmentation's explicit addOptions(token, tToken) verb.
services.addValue(POLICY_TOKEN, { excitement: "!" } satisfies GreetingPolicy);
services.addOptions(POLICY_OPTIONS_TOKEN, POLICY_TOKEN).as("singleton");

// The live config root, so the hosted worker can drive the reload demo.
services.addValue(CONFIG_TOKEN, config);

// The hosted worker — explicit-token signature (no hosting transformer exists).
services.addHostedService(InteropWorker, [
  [RESOLVER_TOKEN, HOST_APPLICATION_LIFETIME_TOKEN, LOGGER_FACTORY_TOKEN, CONFIG_TOKEN],
]);

// ── run the scenario ──────────────────────────────────────────────────────────

const host = builder.build();
await host.runAsync();
