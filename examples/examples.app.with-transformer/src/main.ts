// THE COMPOSITION ROOT — the tokenless dialect.
//
// This file is an ENTRY POINT, and that is a different kind of package from the
// two example libraries it consumes. The libraries reference
// `@rhombus-std/di.core` (plus `@rhombus-std/di.extras`, which is the AUTHORING
// surface — declare-module sugar that peers on di.core, not the engine) and
// nothing else: they are handed a manifest, they contribute registrations to it,
// they hand it back. Only a root references `@rhombus-std/di` — the resolution
// engine — because only a root is allowed to make a container, build it, open a
// scope, or resolve out of it. Grep this file for `@rhombus-std/di` and then
// grep either library for it; the difference is the architecture the two
// packages exist to express.
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
// Authored in the TOKENLESS dialect with the `@rhombus-std/di.extras` +
// `di.extras.options` plugins: every `addValue`/`addOptions` in step 3 and every
// `resolve`/`resolveAsync` in the hosted worker is lowered during the build into
// exactly the explicit-token call the without-transformer app's `main.ts`
// hand-writes. Diff the two files and the only difference is the dialect.
//
// The ONE explicit-token island is the hosted-worker wiring at the bottom: there
// is no `@rhombus-std/di.extras` plugin for the hosting family yet, so
// `addHostedService(...)` and the small `ConfigRoot` value it needs name their
// tokens by hand.
//
// The scenario, everything in concert:
//   - config sources feed a reactive IOptions<ServerOptions> through the full
//     configure → post-configure → validate pipeline;
//   - both example libraries' registrations land in ONE container, each through
//     its own package-named entry function;
//   - the with-transformer library's report factory receives the IGreeting
//     COLLECTION aggregating BOTH libraries, the live options, the policy wrap
//     and an optional health probe — all as ordinary constructor-style
//     PARAMETERS, filled by the container;
//   - the async banner is reached with resolveAsync;
//   - a config reload fires a live options update through the subscription.
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
// Brings the config-bind configure step + the runtime `addOptions` verb the
// `addOptions<T>()` sugar lowers to. Side-effect import — MUST stay for the
// prototype patch to land.
import { ConfigConfigureOptions } from '@rhombus-std/options.augmentations';

import type { GreetingPolicy, IBanner, IServerReport, ServerOptions } from '@rhombus-std/examples.contracts';
import { addWithTransformerExamples } from '@rhombus-std/examples.lib.with-transformer';
import { addReportingFixture, addWithoutTransformerExamples,
  demonstrateTokenAbi } from '@rhombus-std/examples.lib.without-transformer';

// The app-side chapters of the di tour that runs after the host has shut down.
// Each returns its lines rather than printing, so this file owns the ordering
// and the spacing — see the tour at the bottom.
//
// Two of them are DIALECT-INDEPENDENT and are still here rather than in a
// library: staging a container failure and reading a built provider both need a
// `build()`, and `build()` is the engine. What the libraries keep is everything
// those two chapters do that is NOT the container — the error classifier, the
// manifest read as a value — so each file below is the composition-root half of
// a chapter whose other half is one package over.
import { demonstrateErrors } from './errors-demo.js';
import { demonstrateInfrastructure } from './infrastructure-demo.js';
import { demonstrateLifetimes } from './lifetimes-demo.js';
import { demonstrateManifestSurface } from './manifest-surface-demo.js';
import { demonstrateOpenGenerics } from './open-generics-demo.js';
import { demonstrateRegistration } from './registration-demo.js';
import { demonstrateResolution } from './resolution-demo.js';

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
// Worth noticing that the two calls read identically even though one library is
// authored tokenlessly and the other by hand: the sugar lowers to what the other
// wrote out, so a consumer cannot tell which is which and does not need to.
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

// The reactive server options — registered as a value so every consumer shares
// the one live instance.
services = services.addValue<IOptions<ServerOptions>>(serverOptions);

// A config-independent policy, delivered as a static IOptions<GreetingPolicy>
// through the explicit-wrap addOptions<T>() sugar. The satellite lowers
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
// Every DIALECT-BEARING chapter has a line-for-line twin in the
// without-transformer app, and the two print the SAME lines apart from the
// "with"/"without transformer" header — which is the no-transformer-first rule
// made checkable, since both apps' output is byte-diffed against a checked-in
// `expected.txt`. The dialect-independent chapters have nothing to twin: where
// one is pure library work both apps call the same function, and where it stages
// a container each root writes it out, character for character the same.
//
// Each chapter owns its own container, so nothing here can perturb the host's —
// and each returns its lines rather than printing, which is what lets this file
// decide the order and the spacing.

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
  // ran, so there is nothing for a with-transformer twin to differ in. The
  // token-ABI tour is one library function both apps call; the other two are
  // written at each root because each stages a container, and the two copies
  // are identical for want of anything to differ in. Their header lines say so
  // rather than naming a dialect.
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
