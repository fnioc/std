// The with-transformer composition root — ONE integrated story, authored in the
// tokenless dialect with the @rhombus-std/di.transformer + di.transformer.options
// plugins. Registration lowering is confined to a module's top level, which is
// exactly here (the app's composition root), so every `add`/`addValue`/
// `addOptions` below is authored tokenlessly and lowered during the build. There
// are ZERO hand-written token strings and no manual name-reflection anywhere in
// this file — the guard test in di.transformer.test enforces both.
//
// The scenario, everything in concert:
//   - config sources feed a reactive Options<ServerOptions> through the full
//     configure → post-configure → validate pipeline (#41);
//   - both example libraries' services are registered into ONE container — the
//     with-transformer lib's FormalGreeting + report factory + async banner, and
//     the without-transformer lib's CasualGreeting + health check (its manual
//     registration function);
//   - the report factory (from the built with-transformer lib) resolves the
//     IGreeting COLLECTION aggregating BOTH libraries (#48), the live options,
//     the policy wrap, and probes the health check (#23/#25) — all TOKENLESSLY
//     through an injected Resolver (#49);
//   - the async banner is reached with resolveAsync (#45);
//   - a config reload fires a live options update through the subscription
//     (#6/#40).

import { ConfigurationBuilder } from "@rhombus-std/config";
import type { ConfigurationRoot } from "@rhombus-std/config";
import { ServiceManifest } from "@rhombus-std/di";
import type { ConfigureOptions, PostConfigureOptions, ValidateOptions } from "@rhombus-std/options";
import { Options, OptionsFactory, ValidateOptionsResult } from "@rhombus-std/options";
// Brings the config-bind configure step + the runtime `addOptions` verb the
// `addOptions<T>()` sugar lowers to. Side-effect import — MUST stay for the
// prototype patch to land.
import { ConfigurationConfigureOptions } from "@rhombus-std/options.augmentations";

import type { GreetingPolicy, IBanner, IGreeting, IServerReport, ServerOptions } from "@rhombus-std/examples.contracts";
import { fetchBanner, FormalGreeting, makeServerReport } from "@rhombus-std/examples.lib.with-transformer";
import { addCasualServices } from "@rhombus-std/examples.lib.without-transformer";

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
 * wrapped in `Options.watch` over the config's reload token, so `.value` re-runs
 * the pipeline live and `subscribe` fires on every reload. This assembly needs
 * no DI token, so it is identical across both dialects' apps.
 */
function makeServerOptions(config: ConfigurationRoot): Options<ServerOptions> {
  const bindConfig: ConfigureOptions<ServerOptions> = new ConfigurationConfigureOptions<ServerOptions>(
    config.getSection("Server"),
  );
  const coerce: PostConfigureOptions<ServerOptions> = {
    postConfigure(options: ServerOptions): void {
      // Config leaves are strings; coerce the numeric fields after the bind.
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

// ── container (all registrations tokenless, at module top level) ──────────────

const config = buildConfig();

const services = new ServiceManifest<"singleton">();

// The with-transformer library's greeting, plus the without-transformer
// library's greeting + health check via its manual registration function. Both
// greetings land in the one IGreeting collection.
services.add<IGreeting>(FormalGreeting).as<"singleton">();
addCasualServices(services);

// The async banner (Promise<IBanner>) and the report factory, both from the
// built with-transformer library.
services.addFactory<Promise<IBanner>>(fetchBanner).as<"singleton">();
services.addFactory<IServerReport>(makeServerReport).as<"singleton">();

// The reactive server options — registered as a value so every consumer shares
// the one live instance.
const serverOptions = makeServerOptions(config);
services.addValue<Options<ServerOptions>>(serverOptions);

// A config-independent policy, delivered as a static Options<GreetingPolicy>
// through the explicit-wrap addOptions<T>() sugar (#34). The satellite lowers
// `addOptions<T>()` but not the trailing `.as<>()`, so the lifetime is named in
// the value form (`"singleton"` is a scope name, not a token).
services.addValue<GreetingPolicy>({ excitement: "!" });
services.addOptions<GreetingPolicy>().as("singleton");

const root = services.build().createScope("singleton");

// ── run the scenario ──────────────────────────────────────────────────────────

const report = root.resolve<IServerReport>();
const banner = await root.resolveAsync<IBanner>();

// Subscribe to the live options, then drive a config reload.
const optionsView = root.resolve<Options<ServerOptions>>();
const updates: string[] = [];
const subscription = optionsView.subscribe!((next: ServerOptions) => {
  updates.push(`  reload fired: MaxConnections is now ${next.MaxConnections}`);
});
const before = optionsView.value.MaxConnections;
config.set("Server:MaxConnections", "250");
config.reload();
const after = optionsView.value.MaxConnections;
subscription[Symbol.dispose]();

const lines = [
  "=== @rhombus-std interop — with transformer ===",
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
