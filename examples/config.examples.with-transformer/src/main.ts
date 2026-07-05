// A standalone, runnable `@rhombus-std/config.transformer` consumer — type-driven
// configuration with ZERO hand-written schema.
//
// `.withType<AppConfig>()` is lowered by the `@rhombus-std/config.transformer` ts-patch
// plugin (see tsconfig.json `plugins`) into a generated `.withSchema({...})`
// runtime schema literal at compile time. The runtime (`@rhombus-std/config`) then
// coerces the layered string values against that schema on `build()`, so
// `typed.Server.Port` is a real `number` and `typed.Server.Ssl` a real
// `boolean`, all inferred from the plain `AppConfig` interface.
//
// The `import "@rhombus-std/config/with-type-augment"` brings the `.withType`
// authoring form into scope. Compile with `tspc` (ts-patch's patched compiler),
// NOT plain `tsc`: under plain `tsc` the plugin never runs and `.withType`
// reaches its throwing runtime stub — the honest, loud failure.

import { ConfigurationBuilder } from "@rhombus-std/config";
import "@rhombus-std/config/with-type-augment";

interface AppConfig {
  Server: { Host: string; Port: number; Ssl?: boolean };
  Database: { Primary: { Host: string; PoolSize: number } };
}

const typed = new ConfigurationBuilder()
  .addInMemoryCollection({
    "Server:Host": "0.0.0.0",
    "Server:Port": "8080",
    "Server:Ssl": "true",
    "Database:Primary:Host": "db.internal",
    "Database:Primary:PoolSize": "20",
  })
  .withType<AppConfig>()
  .build();

const lines = [
  "=== @rhombus-std/config.transformer — with-transformer ===",
  `server: ${JSON.stringify(typed.Server)}`,
  `database primary: ${JSON.stringify(typed.Database.Primary)}`,
];

for (const line of lines) {
  console.log(line);
}
