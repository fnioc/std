// A standalone, runnable `@rhombus-std/config` consumer -- no dependency-injection
// framework, no compiler transformer, no decorators. Just a
// `ConfigurationBuilder` over layered sources, read two ways:
//
//   - Tier 1: `withSchema({...}).build()` returns a typed, fully-coerced plain
//     object (`config.Server.Port` is a `number`).
//   - Tier 0: `build()` returns the untyped Section tree; read raw strings and
//     coerce on demand (`getSection("Server").getNum("Port")`).
//
// Config layering (last source registered wins, per key):
//   in-memory defaults -> appsettings.json -> appsettings.Development.json
//   (optional overlay) -> environment variables (APP_ prefix) -> command-line
//   arguments.
//
// `bun run start` fixes an environment variable and a command-line argument so
// the printed output is deterministic: Host comes from the env override, Port
// from the CLI override, and Ssl from the Development overlay -- proving every
// layer takes effect, in precedence order.

import { ConfigurationBuilder, OPTIONAL } from "@rhombus-std/config";
// Bare side-effect imports install addJsonFile / addEnvironmentVariables /
// addCommandLine onto ConfigurationBuilder from each provider package. No
// import is needed for addInMemoryCollection -- it ships directly on
// @rhombus-std/config.
import "@rhombus-std/config.json";
import "@rhombus-std/config.env";
import "@rhombus-std/config.commandline";

// One runtime schema literal is the single source of truth for both the shape
// and its coerced type -- no separate hand-written interface to keep in sync.
// An optional field is wrapped inline with the OPTIONAL symbol.
const SCHEMA = {
  Server: { Host: "string", Port: "number", Ssl: { [OPTIONAL]: "boolean" } },
  Database: {
    Primary: { Host: "string", Database: "string", PoolSize: "number" },
    Replica: { Host: "string", Database: "string", PoolSize: "number" },
  },
} as const;

function makeBuilder(): ConfigurationBuilder {
  return new ConfigurationBuilder()
    .addInMemoryCollection({
      "Server:Host": "0.0.0.0",
      "Server:Port": "80",
    })
    .addJsonFile("appsettings.json")
    .addJsonFile("appsettings.Development.json", { optional: true })
    .addEnvironmentVariables({ prefix: "APP_" })
    .addCommandLine(process.argv.slice(2));
}

// Tier 1: typed, fully-coerced tree. `typed.Server.Port` is a `number`.
const typed = makeBuilder().withSchema(SCHEMA).build();

// Tier 0: untyped Section tree, coerce on demand.
const raw = makeBuilder().build();

const lines = [
  "=== @rhombus-std/config -- basic ===",
  `server: ${JSON.stringify(typed.Server)}`,
  `database primary: ${JSON.stringify(typed.Database.Primary)}`,
  `database replica: ${JSON.stringify(typed.Database.Replica)}`,
  `raw Server:Host=${raw.get("Server:Host")}, `
  + `getNum(Server:Port)=${raw.getSection("Server").getNum("Port")}`,
];

for (const line of lines) {
  console.log(line);
}
