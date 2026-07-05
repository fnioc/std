# @rhombus-std/di — with the transformer

A runnable example of [`@rhombus-std/di`](../../libraries/di) authored **interface-first**
with the [`@rhombus-std/di.transformer`](../../libraries/di.transformer) ts-patch plugin.

The contracts and service **classes** live in
[`@rhombus-std/di.examples.shared`](../di.examples.shared) — the single canonical set both examples
wire. This example and [`../di.examples.without-transformer`](../di.examples.without-transformer) import
the _identical_ classes; the ONLY difference between the two `main.ts` files is
the **wiring style**. Diff them side by side and everything but the authoring
mechanism is the same.

## What it shows

- Type-driven registration: `services.add<IGreeter>(Greeter).as<"singleton">()` —
  no string tokens by hand. The transformer lowers each call and injects the
  constructor-dependency metadata.
- Tokenless resolution: `resolve<IGreeter>()` — the transformer derives the token
  from the type argument.
- Singleton lifetime + a `request` child scope with per-scope lifetimes.
- **Inline union** (`A | B` ctor param): `UnionConsumer(sink: ILogger | IMetricsBackend)`
  lowers to a `{ union: [...] }` slot; the first registered member wins.
- **`Inject<T, "tok">` brand**: `DiagnosticsService` pins its `clock` param to
  `"app:primary-clock"`, overriding structural derivation.
- **Open generics**: one placeholder registration
  (`add<IRepository<$<1>>>(SqlRepository<$<1>>)`) covers every closing of
  `IRepository<T>`; a closed instantiation-expression registration
  (`add<IRepository<Order>>(InMemoryRepository<Order>)`) beats the open fallback
  for its closing; distinct closings resolve (tokenlessly, via
  `resolve<IRepository<User>>()`) as distinct singletons; the `Typeof<T>` witness
  hands each instance its closing's token string; and a generic-on-generic
  auditor (`add<IAuditor<$<1>>>(RepositoryAuditor<$<1>>)`) closes recursively.

## How it works

`tspc` (ts-patch's patched compiler) runs `@rhombus-std/di.transformer` during `build`.
The shared source is imported by a relative path (`../../di.examples.shared/src/index.js`),
so `tspc` compiles it into this example's own `dist` — plugin-less source
inlining, no bundler. Inspect `dist/di.examples.with-transformer/src/main.js` afterwards to
see the lowered output: every `add<I>(C)` becomes `add("token", C, [[...]])`,
with the derived dependency signature carried inline as the third argument —
no separate prelude call, nothing hoisted. Non-generic and generic
registrations lower the identical way; a generic registration's signature just
carries a `{ typeArg: N }` slot in place of a plain token
(`add("./di.examples.shared/src/contracts/IRepository<$1>", SqlRepository, [[...]])`).

The tokenless authored form (`resolve<IRepository<User>>()`) lowers to the
derived closed token (`./di.examples.shared/src/contracts/IRepository<./di.examples.shared/src/contracts/User>`).

## Run it

```sh
bun run build   # tspc compile to dist/
bun run start   # run it
bun run test    # run + assert stdout (expected.txt)
bun run lint    # typecheck
```

Or directly with bun: `bun run build && bun run start`.
