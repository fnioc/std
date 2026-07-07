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

import { ConfigurationBuilder } from "@rhombus-std/config";
import type { ConfigurationRoot } from "@rhombus-std/config";
import { RESOLVER_TOKEN, ServiceManifest } from "@rhombus-std/di";
import type { ConfigureOptions, PostConfigureOptions, ValidateOptions } from "@rhombus-std/options";
import { Options, OptionsFactory, ValidateOptionsResult } from "@rhombus-std/options";
import { ConfigurationConfigureOptions } from "@rhombus-std/options.augmentations";

import type { GreetingPolicy, IBanner, IServerReport, ServerOptions } from "@rhombus-std/examples.contracts";
import { fetchBanner, FormalGreeting, makeServerReport } from "@rhombus-std/examples.lib.with-transformer";
import { addCasualServices, GREETING_TOKEN } from "@rhombus-std/examples.lib.without-transformer";

// The tokens the transformer would derive, hand-written. GREETING_TOKEN is
// re-used from the without-transformer library so both greetings register at the
// one shared element token; the rest follow the same `<import-specifier>:<name>`
// / closed-generic `base<arg>` grammar.
const BANNER_TOKEN = "Promise<@rhombus-std/examples.contracts:IBanner>";
const REPORT_TOKEN = "@rhombus-std/examples.contracts:IServerReport";
const SERVER_OPTIONS_TOKEN = "@rhombus-std/options:Options<@rhombus-std/examples.contracts:ServerOptions>";
const POLICY_TOKEN = "@rhombus-std/examples.contracts:GreetingPolicy";
const POLICY_OPTIONS_TOKEN = "@rhombus-std/options:Options<@rhombus-std/examples.contracts:GreetingPolicy>";

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

// ── container (all registrations explicit-token) ──────────────────────────────

const config = buildConfig();

const services = new ServiceManifest<"singleton">();

// The with-transformer library's greeting at the shared token, plus the
// without-transformer library's greeting + health check via its manual function.
services.add(GREETING_TOKEN, FormalGreeting, [[]]).as("singleton");
addCasualServices(services);

// The async banner and the report factory, both from the built with-transformer
// library — the report factory takes the injected provider (RESOLVER_TOKEN slot).
services.addFactory(BANNER_TOKEN, fetchBanner, [[]]).as("singleton");
services.addFactory(REPORT_TOKEN, makeServerReport, [[RESOLVER_TOKEN]]).as("singleton");

// The reactive server options — one shared live instance.
const serverOptions = makeServerOptions(config);
services.addValue(SERVER_OPTIONS_TOKEN, serverOptions);

// A config-independent policy, wrapped as a static Options<GreetingPolicy> via
// the augmentation's explicit addOptions(token, tToken) verb.
services.addValue(POLICY_TOKEN, { excitement: "!" } satisfies GreetingPolicy);
services.addOptions(POLICY_OPTIONS_TOKEN, POLICY_TOKEN).as("singleton");

const root = services.build().createScope("singleton");

// ── run the scenario ──────────────────────────────────────────────────────────

const report = root.resolve<IServerReport>(REPORT_TOKEN);
const banner = await root.resolveAsync<IBanner>(BANNER_TOKEN);

const optionsView = root.resolve<Options<ServerOptions>>(SERVER_OPTIONS_TOKEN);
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
