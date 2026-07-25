// THE COMPOSITION ROOT — the without-transformer dialect.
//
// This file is an ENTRY POINT, and that is a different kind of package from the
// two example libraries it consumes. The libraries reference
// `@rhombus-std/di.core` and nothing else: they are handed a manifest, they
// contribute registrations to it, they hand it back. Only a root references
// `@rhombus-std/di` — the resolution engine — because only a root is allowed to
// make a container, build it, open a scope, or resolve out of it. Grep this file
// for `@rhombus-std/di` and then grep either library for it; the difference is
// the architecture the two packages exist to express.
//
// THE FIVE STEPS, and they are the shape to copy. See "the composition root"
// below, where each one is marked:
//
//   1. make the manifest       — here the Generic Host makes it, and hands it
//                                over as `builder.services`;
//   2. hand it to each library — one `add<PackageName>(services)` call apiece,
//                                threaded, because the manifest is immutable;
//   3. add what the APP owns   — its config, its options, its hosted worker;
//   4. build the provider      — `builder.build()`;
//   5. one top-level resolve   — `host.runAsync()`, which resolves the hosted
//                                services and starts them. Nothing else in this
//                                file resolves anything, and nothing in either
//                                library resolves anything at all.
//
// It is wired by hand with plain `tsc`: every registration and resolution names
// an explicit string token. The token strings are spelled exactly as
// `@rhombus-std/di.extras` derives them for the package-public contracts, which
// is what lets THIS app consume the built with-transformer library at all — its
// baked-in tokens agree with these. Diff this file against the with-transformer
// app's `main.ts` and the only difference is the authoring dialect; the
// scenario, and the output, are the same.
//
// The interop matrix in one file: this manual root composes the with-transformer
// library's contributions AND the without-transformer library's, each dialect
// producing and consuming the other.
//
// BOOTS VIA THE GENERIC HOST (@rhombus-std/hosting): the scenario runs inside a
// hosted worker (`InteropWorker`) that implements `IHostedLifecycleService` and
// logs its ordered lifecycle callbacks through an injected `ILogger` —
// mirroring the canonical worker+lifecycle sample in
// tests/hosting.test/test/index.test.ts. The worker calls
// `IHostApplicationLifetime.stopApplication()` once its work is done, so
// `runAsync` returns deterministically with no reliance on Ctrl+C / signals.

import { ConfigBuilder } from '@rhombus-std/config';
import type { ConfigRoot } from '@rhombus-std/config';
import { RESOLVER_TOKEN, ServiceManifest } from '@rhombus-std/di';
import type { IResolver, IServiceManifest } from '@rhombus-std/di';
import { Host, HOST_APPLICATION_LIFETIME_TOKEN } from '@rhombus-std/hosting';
import type { IHostApplicationLifetime, IHostedLifecycleService } from '@rhombus-std/hosting';
import { LOGGER_FACTORY_TOKEN } from '@rhombus-std/logging';
import type { ILogger, ILoggerFactory } from '@rhombus-std/logging.core';
import { logInformation } from '@rhombus-std/logging.core';
import type { IConfigureOptions, IPostConfigureOptions, IValidateOptions } from '@rhombus-std/options';
import { type IOptions, Options, OptionsFactory, ValidateOptionsResult } from '@rhombus-std/options';
import { ConfigConfigureOptions } from '@rhombus-std/options.augmentations';

import type { GreetingPolicy, IBanner, IServerReport, ServerOptions } from '@rhombus-std/examples.contracts';
import { addWithTransformerExamples, EXAMPLE_TOKENS } from '@rhombus-std/examples.lib.with-transformer';
import { addReportingFixture, addWithoutTransformerExamples,
  demonstrateTokenAbi } from '@rhombus-std/examples.lib.without-transformer';

// The two DIALECT-INDEPENDENT chapters that need a container to run. They are
// composition-root work, so they live in a composition-root package rather than
// in either library — and both example apps import the SAME functions, which is
// what keeps their output identical by construction rather than by discipline.
import { demonstrateErrors, demonstrateManifestSurface } from '@rhombus-std/examples.app.shared';

// The app-side chapters of the di tour that runs after the host has shut down.
// Each returns its lines rather than printing, so this file owns the ordering
// and the spacing — see the tour at the bottom.
import { demonstrateInfrastructure } from './infrastructure-demo.js';
import { demonstrateLifetimes } from './lifetimes-demo.js';
import { demonstrateOpenGenerics } from './open-generics-demo.js';
import { demonstrateRegistration } from './registration-demo.js';
import { demonstrateResolution } from './resolution-demo.js';

// The tokens for the services this APP registers, hand-written in the derived
// `<import-specifier>:<name>` / closed-generic `base<arg>` grammar. Note what is
// NOT here any more: the with-transformer library's own tokens. This root used
// to hand-guess them so it could register that library's classes itself — which
// is the same rule violation from the other side, an application wiring somebody
// else's package. The library now ships `addWithTransformerExamples`, so the only
// tokens it still exports are the two the worker below has to ASK for.
//
// CONFIG_TOKEN has no transformer-derived counterpart to match — it exists purely
// to thread the manually-built `ConfigRoot` into the hosted worker.
const SERVER_OPTIONS_TOKEN = '@rhombus-std/options:IOptions<@rhombus-std/examples.contracts:ServerOptions>';
const POLICY_TOKEN = '@rhombus-std/examples.contracts:GreetingPolicy';
const POLICY_OPTIONS_TOKEN = '@rhombus-std/options:IOptions<@rhombus-std/examples.contracts:GreetingPolicy>';
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
 * wrapped in `Options.watch` over the config's reload token. Token-free, so it is
 * identical to the with-transformer app's assembly.
 */
function makeServerOptions(config: ConfigRoot): IOptions<ServerOptions> {
  const bindConfig: IConfigureOptions<ServerOptions> = new ConfigConfigureOptions<ServerOptions>(
    config.getSection('Server'),
  );
  const coerce: IPostConfigureOptions<ServerOptions> = {
    postConfigure(options: ServerOptions): void {
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
 * injected `ILogger` — mirroring the canonical worker+lifecycle sample.
 *
 * This is the one class in the example set that takes the provider and is not
 * apologised for: it is the ROOT's own top-level service, the thing the single
 * `runAsync` resolve lands on, and reaching further into the container from
 * there is the composition root doing its job. The rule the libraries live under
 * ("declare what you need as a parameter") is about LIBRARY code; a root is the
 * one place that is allowed to know the container exists.
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

    // The two tokens the with-transformer library exports, because ASKING for
    // its services is the one thing the library cannot do on this root's behalf.
    const report = this.#resolver.resolve<IServerReport>(EXAMPLE_TOKENS.report);
    const banner = await this.#resolver.resolveAsync<IBanner>(EXAMPLE_TOKENS.banner);

    const optionsView = this.#resolver.resolve<IOptions<ServerOptions>>(SERVER_OPTIONS_TOKEN);
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
      '=== @rhombus-std interop — without transformer ===',
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

// ── the composition root ──────────────────────────────────────────────────────

const config = buildConfig();
const serverOptions = makeServerOptions(config);

// STEP 1 — make the manifest. The Generic Host owns it here and hands it over as
// a writable slot; a container-only app would write `new ServiceManifest()`
// instead, exactly as the tour's chapters do further down. Either way it is the
// ROOT that starts the chain.
const builder = Host.createApplicationBuilder();
let services = builder.services;

// STEP 2 — hand the manifest to each library, one `add*` call apiece.
//
// This is the whole consumer-facing shape of a library that ships services: one
// exported function, named after the package, taking a manifest and returning
// one. Neither call below knows or cares what the other registered — both
// greetings land in the same `IGreeting` collection because both libraries chose
// the same contract token, which is what a shared contracts package is for.
//
// The manifest is IMMUTABLE, so every call is threaded back into `services`; a
// bare `addWithoutTransformerExamples(services)` statement would register
// nothing at all.
services = addWithTransformerExamples(services);
services = addWithoutTransformerExamples(services);

// STEP 3 — add what the APPLICATION owns.
//
// Configuration, the options pipeline built over it, and the policy this
// deployment chose are the root's, not any library's: they are the answers a
// library asks questions about. A library that registered its own config would
// be deciding for every consumer it will ever have.

// The reactive server options — one shared live instance.
services = services.addValue(SERVER_OPTIONS_TOKEN, serverOptions);

// A config-independent policy, wrapped as a static IOptions<GreetingPolicy> via
// the augmentation's explicit addOptions(token, tToken) verb.
services = services.addValue(POLICY_TOKEN, { excitement: '!' } satisfies GreetingPolicy);
services = services.addOptions(POLICY_OPTIONS_TOKEN, POLICY_TOKEN).as('singleton');

// The live config root, so the hosted worker can drive the reload demo.
services = services.addValue(CONFIG_TOKEN, config);

// The hosted worker — explicit-token signature (no hosting transformer exists).
//
// The composed chain goes BACK onto the builder. `builder.services` is a live
// slot over an immutable chain, so everything registered into the local
// `services` above is invisible to `build()` until it is handed back here.
builder.services = services.addHostedService(InteropWorker, [
  [RESOLVER_TOKEN, HOST_APPLICATION_LIFETIME_TOKEN, LOGGER_FACTORY_TOKEN, CONFIG_TOKEN],
]);

// ── run the scenario ──────────────────────────────────────────────────────────

// STEP 4 — build the provider.
const host = builder.build();
// STEP 5 — the one top-level resolve. `runAsync` resolves the registered
// `IHostedService` collection and drives it through its lifecycle; every other
// object in the application is constructed because something above it declared a
// dependency on it. That single entry is what a container is FOR.
await host.runAsync();

// ── the di tour ───────────────────────────────────────────────────────────────
//
// The host scenario above is ONE application seen end to end. What follows is a
// guided tour of the di surface itself, in the order a reader meets it: what you
// can put IN a container, how you get things OUT, how long what you got lives,
// how one registration serves every closing of a generic, and finally the pieces
// a LIBRARY author (rather than an application) reaches for.
//
// Each chapter owns its own container, so nothing here can perturb the host's —
// and each returns its lines rather than printing, which is what lets this file
// decide the order and the spacing. The whole run is deterministic (fixed
// clocks, fixed seed data, no filesystem, no randomness): the app's checked-in
// `expected.txt` is a byte-for-byte diff of this output.

// The token-ABI chapter reads a manifest as DATA — nothing in it is ever built
// or resolved. The library owns the fixture's REGISTRATIONS and the report;
// MAKING the manifest to put them in is the root's job, which is this whole
// restructure in two lines.
let reporting: IServiceManifest<'singleton'> = new ServiceManifest<'singleton'>();
reporting = addReportingFixture(reporting);

const tour: readonly (readonly string[])[] = [
  demonstrateRegistration(),
  await demonstrateResolution(),
  await demonstrateLifetimes(),
  demonstrateOpenGenerics(),
  // Three chapters with no dialect: an error class, a token string and the
  // manifest's own data structure read the same whether or not a transformer
  // ran, so there is nothing for a with-transformer twin to differ in and both
  // apps run these same three functions. Their header lines say so rather than
  // naming a dialect.
  await demonstrateErrors(),
  demonstrateTokenAbi(reporting),
  demonstrateManifestSurface(),
  // The library-author infrastructure surface, driven from here — because the
  // half of it that needs a provider IS root work, and the half that does not
  // stayed in the library where it belongs.
  demonstrateInfrastructure(),
];

for (const chapter of tour) {
  console.log('');
  for (const line of chapter) {
    console.log(line);
  }
}
