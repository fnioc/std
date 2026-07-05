# with-transformer example

A standalone, runnable `@rhombus-std/config` consumer that uses the
`@rhombus-std/config.transformer` ts-patch plugin for **type-driven** configuration —
no hand-written schema.

```ts
interface AppConfig {
  Server: { Host: string; Port: number; Ssl?: boolean };
  Database: { Primary: { Host: string; PoolSize: number } };
}

const typed = new ConfigurationBuilder()
  .addInMemoryCollection({/* flat string values */})
  .withType<AppConfig>() // ← lowered to .withSchema({...}) by the transformer
  .build();

typed.Server.Port; // number — coerced from "8080" at runtime
```

Compiled with `tspc` (ts-patch's patched compiler), which reads the
`plugins` entry in `tsconfig.json` and applies the transform. Plain `tsc`
would leave `.withType` in place, and at runtime it would hit
`@rhombus-std/config`'s throwing stub — the honest, loud failure that proves the
transform is what makes `.withType` real.

```sh
bun run start   # build with tspc, then run the emitted dist/main.js
bun run test    # build + diff against expected.txt
```
