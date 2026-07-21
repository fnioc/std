// The with-transformer composition root — ONE integrated story, authored in the
// tokenless dialect with the @rhombus-std/di.transformer + di.transformer.options
// plugins. Registration lowering is confined to a module's top level, which is
// exactly here (the app's composition root), so every `add`/`addValue`/
// `addOptions` in the CONTAINER SETUP below is authored tokenlessly and lowered
// during the build. The ONE exception is the hosted-worker wiring at the very
// bottom: there is no `@rhombus-std/di.transformer` plugin for the hosting
// family yet, so `addHostedService(...)` and the small `ConfigRoot` value
// it needs are registered with EXPLICIT, hand-written tokens — the guard test in
// di.transformer.test only requires every `resolve<T>()` / `resolveAsync<T>()` /
// `tryResolve<T>()` CALL to stay tokenless (see below), which the hosted worker
// still honors.
//
// The scenario, everything in concert:
//   - config sources feed a reactive IOptions<ServerOptions> through the full
//     configure → post-configure → validate pipeline (#41);
//   - both example libraries' services are registered into ONE container — the
//     with-transformer lib's FormalGreeting + report factory + async banner, and
//     the without-transformer lib's CasualGreeting + health check (its manual
//     registration function);
//   - the report factory (from the built with-transformer lib) resolves the
//     IGreeting COLLECTION aggregating BOTH libraries (#48), the live options,
//     the policy wrap, and probes the health check (#23/#25) — all TOKENLESSLY
//     through an injected IResolver (#49);
//   - the async banner is reached with resolveAsync (#45);
//   - a config reload fires a live options update through the subscription
//     (#6/#40).
//
// BOOTS VIA THE GENERIC HOST (@rhombus-std/hosting): the container above is
// registered onto the host's own `ServiceManifest`, and the scenario itself runs
// inside a hosted worker (`InteropWorker`) that implements
// `IHostedLifecycleService` and logs its ordered lifecycle callbacks through an
// injected `ILogger` — mirroring the canonical worker+lifecycle sample in
// tests/hosting.test/test/index.test.ts. Its `resolve<T>()` / `resolveAsync<T>()`
// calls stay tokenless (the transformer lowers them, same as the library's own
// factory); only its CONSTRUCTOR SIGNATURE (an `addHostedService` concept the
// transformer does not cover) names explicit tokens. The worker calls
// `IHostApplicationLifetime.stopApplication()` once its work is done, so
// `runAsync` returns deterministically with no reliance on Ctrl+C / signals.

import { ConfigBuilder } from '@rhombus-std/config';
import type { ConfigRoot } from '@rhombus-std/config';
import { RESOLVER_TOKEN } from '@rhombus-std/di';
import type { IResolver } from '@rhombus-std/di';
import { Host, HOST_APPLICATION_LIFETIME_TOKEN } from '@rhombus-std/hosting';
import type { IHostApplicationLifetime, IHostedLifecycleService } from '@rhombus-std/hosting';
import { LOGGER_FACTORY_TOKEN } from '@rhombus-std/logging';
import type { ILogger, ILoggerFactory } from '@rhombus-std/logging.core';
import { logInformation } from '@rhombus-std/logging.core';
import type { IConfigureOptions, IPostConfigureOptions, IValidateOptions } from '@rhombus-std/options';
import { type IOptions, Options, OptionsFactory, ValidateOptionsResult } from '@rhombus-std/options';
// Brings the config-bind configure step + the runtime `addOptions` verb the
// `addOptions<T>()` sugar lowers to. Side-effect import — MUST stay for the
// prototype patch to land.
import { ConfigConfigureOptions } from '@rhombus-std/options.augmentations';

import type { GreetingPolicy, IBanner, IGreeting, IServerReport, ServerOptions } from '@rhombus-std/examples.contracts';
import { fetchBanner, FormalGreeting, makeServerReport } from '@rhombus-std/examples.lib.with-transformer';
import { addCasualServices } from '@rhombus-std/examples.lib.without-transformer';

// The ONE hand-written token in this file — see the header note. It has no
// transformer-derived counterpart to match; it exists purely to thread the
// manually-built `ConfigRoot` into the hosted worker's explicit-token
// `addHostedService` signature below.
const CONFIG_TOKEN = '@rhombus-std/config:ConfigRoot';

// ── config ───────────────────────────────────────────────────────────────────

/** The layered configuration root — an in-memory source seeds the server keys. */
function buildConfig(): ConfigRoot {
  return new ConfigBuilder()
    .addInMemoryCollection({
      'Server:Host': '0.0.0.0',
      'Server:Port': '8080',
      'Server:MaxConnections': '100',
    })
    .build() as unknown as ConfigRoot;
}

/**
 * Assembles the reactive `IOptions<ServerOptions>`: the full OptionsFactory
 * pipeline (config-bind configure → coercion post-configure → range validate)
 * wrapped in `Options.watch` over the config's reload token, so `.value` re-runs
 * the pipeline live and `subscribe` fires on every reload. This assembly needs
 * no DI token, so it is identical across both dialects' apps.
 */
function makeServerOptions(config: ConfigRoot): IOptions<ServerOptions> {
  const bindConfig: IConfigureOptions<ServerOptions> = new ConfigConfigureOptions<ServerOptions>(
    config.getSection('Server'),
  );
  const coerce: IPostConfigureOptions<ServerOptions> = {
    postConfigure(options: ServerOptions): void {
      // Config leaves are strings; coerce the numeric fields after the bind.
      options.Port = Number(options.Port);
      options.MaxConnections = Number(options.MaxConnections);
    },
  };
  const validate: IValidateOptions<ServerOptions> = {
    validate(options: ServerOptions): ValidateOptionsResult {
      if (options.Port > 0 && options.MaxConnections > 0) {
        return ValidateOptionsResult.success;
      }
      return ValidateOptionsResult.fail('Port and MaxConnections must be positive');
    },
  };
  const build = (): ServerOptions =>
    new OptionsFactory<ServerOptions>(
      () => ({ Host: '', Port: 0, MaxConnections: 0 }),
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
 * injected `ILogger` — mirroring the canonical worker+lifecycle sample. Its
 * `resolve`/`resolveAsync` calls stay TOKENLESS (transformer-lowered); only its
 * constructor signature (below, at `addHostedService`) names explicit tokens.
 */
class InteropWorker implements IHostedLifecycleService {
  readonly #resolver: IResolver;
  readonly #lifetime: IHostApplicationLifetime;
  readonly #logger: ILogger;
  readonly #config: ConfigRoot;

  public constructor(
    resolver: IResolver,
    lifetime: IHostApplicationLifetime,
    loggerFactory: ILoggerFactory,
    config: ConfigRoot,
  ) {
    this.#resolver = resolver;
    this.#lifetime = lifetime;
    this.#logger = loggerFactory.createLogger('Rhombus.Examples.InteropWorker');
    this.#config = config;
  }

  public starting(): Promise<void> {
    logInformation(this.#logger, 'starting');
    return Promise.resolve();
  }

  public async start(): Promise<void> {
    logInformation(this.#logger, 'start');

    const report = this.#resolver.resolve<IServerReport>();
    const banner = await this.#resolver.resolveAsync<IBanner>();

    const optionsView = this.#resolver.resolve<IOptions<ServerOptions>>();
    const updates: string[] = [];
    const subscription = optionsView.subscribe!((next: ServerOptions) => {
      updates.push(`  reload fired: MaxConnections is now ${next.MaxConnections}`);
    });
    const before = optionsView.value.MaxConnections;
    this.#config.set('Server:MaxConnections', '250');
    this.#config.reload();
    const after = optionsView.value.MaxConnections;
    subscription[Symbol.dispose]();

    const lines = [
      '=== @rhombus-std interop — with transformer ===',
      `async banner (resolveAsync): ${banner.text}`,
      ...report.lines,
      'live reload (config → reactive Options):',
      `  MaxConnections before reload: ${before}`,
      ...updates,
      `  MaxConnections after reload: ${after}`,
    ];

    for (const line of lines) {
      console.log(line);
    }
  }

  public started(): Promise<void> {
    logInformation(this.#logger, 'started');
    this.#lifetime.stopApplication();
    return Promise.resolve();
  }

  public stopping(): Promise<void> {
    logInformation(this.#logger, 'stopping');
    return Promise.resolve();
  }

  public stop(): Promise<void> {
    logInformation(this.#logger, 'stop');
    return Promise.resolve();
  }

  public stopped(): Promise<void> {
    logInformation(this.#logger, 'stopped');
    return Promise.resolve();
  }
}

// ── host + container (registrations tokenless, at module top level) ───────────

const config = buildConfig();
const serverOptions = makeServerOptions(config);

const builder = Host.createApplicationBuilder();
let services = builder.services;

// The with-transformer library's greeting, plus the without-transformer
// library's greeting + health check via its manual registration function. Both
// greetings land in the one IGreeting collection. The manifest is immutable, so
// every registration call is threaded back into `services` — a bare
// `services.add(...)` statement would silently register nothing.
services = services.add<IGreeting>(FormalGreeting).as<'singleton'>();
services = addCasualServices(services);

// The async banner (Promise<IBanner>) and the report factory, both from the
// built with-transformer library.
services = services.addFactory<Promise<IBanner>>(fetchBanner).as<'singleton'>();
services = services.addFactory<IServerReport>(makeServerReport).as<'singleton'>();

// The reactive server options — registered as a value so every consumer shares
// the one live instance.
services = services.addValue<IOptions<ServerOptions>>(serverOptions);

// A config-independent policy, delivered as a static IOptions<GreetingPolicy>
// through the explicit-wrap addOptions<T>() sugar (#34). The satellite lowers
// `addOptions<T>()` but not the trailing `.as<>()`, so the lifetime is named in
// the value form (`"singleton"` is a scope name, not a token).
services = services.addValue<GreetingPolicy>({ excitement: '!' });
services = services.addOptions<GreetingPolicy>().as('singleton');

// The live config root + the hosted worker — the file's one explicit-token
// island (see the header note): no hosting transformer exists yet.
services = services.addValue(CONFIG_TOKEN, config);

// The composed chain goes BACK onto the builder. `builder.services` is a live
// slot over an immutable chain, so everything registered into the local
// `services` above is invisible to `build()` until it is handed back here.
builder.services = services.addHostedService(InteropWorker, [
  [RESOLVER_TOKEN, HOST_APPLICATION_LIFETIME_TOKEN, LOGGER_FACTORY_TOKEN, CONFIG_TOKEN],
]);

// ── run the scenario ──────────────────────────────────────────────────────────

const host = builder.build();
await host.runAsync();
