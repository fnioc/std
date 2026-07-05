# basic

A standalone, runnable consumer of `@rhombus-std/config` + its three provider
packages (`@rhombus-std/config.json`, `@rhombus-std/config.env`, `@rhombus-std/config.commandline`) -- no
dependency-injection framework, no compiler transformer, no decorators.

```sh
bun install
bun run start
```

`start` rebuilds (`bun run build`, i.e. plain `tsc`) and then
runs `dist/main.js` with a fixed environment variable and command-line
argument, so the printed output is deterministic:

```
=== @rhombus-std/config -- basic ===
server: {"Host":"10.0.0.5","Port":8080,"Ssl":true}
database primary: {"Host":"db-primary.internal","Database":"app","PoolSize":10}
database replica: {"Host":"db-replica.internal","Database":"app","PoolSize":5}
raw Server:Host=10.0.0.5, getNum(Server:Port)=8080
```

## What this demonstrates

- **Layered sources**: an in-memory default collection (lowest precedence) <-
  `appsettings.json` (base) <- `appsettings.Development.json` (optional
  overlay, present here) <- environment variables (`APP_` prefix) <-
  command-line arguments (highest precedence), each source overriding the
  previous one key-by-key. The final `Host` comes from the env override,
  `Port` from the CLI override, and `Ssl` from the Development overlay --
  proving every layer actually applies, in precedence order.
- **Provider packages via side-effect imports**: `addJsonFile`,
  `addEnvironmentVariables`, and `addCommandLine` are not baked into
  `ConfigurationBuilder` -- each is contributed by its own provider package
  (`@rhombus-std/config.json` / `-env` / `-commandline`) through TS declaration merging
  - a prototype patch. `src/main.ts` brings them in with bare
    `import "@rhombus-std/config.json";` lines alongside the named `@rhombus-std/config`
    import. `addInMemoryCollection` needs no such import -- it ships directly
    on `@rhombus-std/config`.
- **Tier 1 -- `withSchema` coercion**: one runtime schema literal (`SCHEMA` in
  `src/main.ts`) is the single source of truth for both the shape and its
  static type. `withSchema(SCHEMA).build()` returns a fully-coerced plain
  object -- `Server.Port` is a real `number`, `Server.Ssl` a `boolean` -- and a
  missing required key or a non-numeric `Port` throws a `SchemaCoercionError`
  listing every problem at once. An optional field is wrapped inline with the
  `OPTIONAL` symbol, so a real config key named `optional` can never be
  mistaken for the wrapper.
- **Tier 0 -- on-demand helpers**: `build()` without a schema returns the
  untyped Section tree. Read raw strings with `get`, navigate with
  `getSection`, and coerce a leaf only where you need it
  (`getSection("Server").getNum("Port")`).
