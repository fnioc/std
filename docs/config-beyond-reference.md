# `@rhombus-std/config` — features beyond the reference configuration engine

`@rhombus-std/config` mirrors the reference configuration engine's source/provider/root model
faithfully, then goes further in several directions the reference engine has no equivalent for.
Each entry below assumes you already know sources, providers, and section navigation; it only
covers what's new. Snippets build their own `config`/`root`/`manager` via `ConfigurationBuilder`
or `ConfigurationManager`, the same way a real consumer would.

## 1. Live-reload reactivity, by design, everywhere

The reference engine ships the same change-token plumbing at roughly the same layer. The
difference is that here the WHOLE family is built around it: every provider, the root, and the
manager expose a single-fire `IChangeToken`, and `ChangeToken.onChange` composes them so a
subscriber never has to manually re-subscribe after a reload swaps the token out from under it.

```ts
const provider = new JsonConfigurationProvider(
  new JsonConfigurationSource('app.json'),
);
const root = new ConfigurationRoot([provider]);

using _sub = ChangeToken.onChange(() => root.getReloadToken(), () => {
  console.log('config changed:', root.get('Server:Port'));
});

root.reload(); // re-runs provider.load(), then fires the root's token once
root.reload(); // onChange re-subscribed to the FRESH token automatically -- fires again
```

`ConfigurationManager` takes this one step further: it holds its OWN stable token (see #8 below),
so a subscriber registered before a later `add()` still observes every change that add introduces.

## 2. A compile-time schema instead of a reflective binder

The reference engine's typed reads live in a separate reflective binder package: `Get<T>`/`Bind`
walk a real runtime type via reflection, invisible to the compiler and trim-hostile. Here,
Tier 1 is a hand-written, runtime-inspectable `Schema` (leaf kind strings, plain-object nesting, an
`OPTIONAL`-symbol wrapper) that DOUBLES as the coercion driver AND — via `Infer<S>` — the static
type `build()` returns. No DTO class, no reflection. Tier 2 layers `.withType<T>()` +
`config.transformer` codegen on top, generating the Tier-1 schema literal from an authored
interface, so hand-authoring stays the base case and codegen is optional sugar.

```ts
const config = new ConfigurationBuilder()
  .addJsonFile('appsettings.json')
  .withSchema(
    {
      Server: { Host: 'string', Port: 'number' },
      Ssl: { [OPTIONAL]: 'boolean' },
    } as const,
  )
  .build();

config.Server.Port; // number, not string -- COERCED, not just typed
// a missing Server.Host or an unparseable Port throws SchemaCoercionError,
// listing every offending path in one error, not just the first

// Tier 2, with config.transformer's compile-time codegen:
interface AppConfig {
  Server: { Host: string; Port: number; };
  Ssl?: boolean;
}
new ConfigurationBuilder().addJsonFile('appsettings.json').withType<AppConfig>()
  .build();
```

## 3. A bundled in-memory provider

The reference engine's memory provider is an independent package pulled in like any other. Here
it ships INSIDE `config` itself, because an in-memory source is a basic building block --
defaults, test fixtures, programmatic overrides -- not an optional add-on a consumer opts into.

```ts
const config = new ConfigurationBuilder()
  .addInMemoryCollection({ 'Server:Port': '8080' }) // no extra package needed
  .addJsonFile('appsettings.json', { optional: true })
  .build();
```

## 4. A named, inspectable augmentation mechanism that reaches every builder-shaped receiver

TS has no extension methods, so every `add*` sugar method here is a NAMED object literal (one per
reference static extension class) installed onto a class's prototype by a single shared installer,
with the object literal itself also directly callable as a standalone fallback. Because a
reference extension method binds to an INTERFACE, not one class, every `add*` augmentation here
installs onto every class that plays that role -- both `ConfigurationBuilder<T>` and
`ConfigurationManager` -- so the same sugar reaches a live `ConfigurationManager` exactly the way
it reaches a one-shot `ConfigurationBuilder`.

```ts
// method form (primary) -- identical sugar on either receiver
new ConfigurationBuilder().addJsonFile('a.json').addEnvironmentVariables();
new ConfigurationManager().addJsonFile('a.json').addEnvironmentVariables();

// standalone form (fallback) -- the exact same function, callable directly
JsonConfigurationExtensions.addJsonFile(someBuilder, 'a.json');
```

## 5. `toObject(): ConfigObject`

Nothing in the reference abstractions materializes a subtree as a plain nested object -- the
closest thing is the reflective binder, a different package with a different job (typed DTOs, not
a generic dump). `toObject()` sits directly on `IConfiguration` and returns the whole (or a
section's) subtree as an ordinary nested string record.

```ts
const root = new ConfigurationBuilder()
  .addInMemoryCollection({
    'Server:Host': 'h',
    'Server:Port': '8080',
    Flag: 'on',
  })
  .build();

root.toObject();
// { Server: { Host: "h", Port: "8080" }, Flag: "on" }
root.getSection('Server').toObject();
// { Host: "h", Port: "8080" } -- just the subtree
```

## 6. Typed leaf accessors directly on `IConfiguration`

The reference engine keeps `IConfiguration` to a bare string indexer; typed reads live in the
separate binder package, and a write through the indexer returns nothing. Here, `get<T>(path,
factory)` / `getNum` / `getBool` (each with an optional default) sit directly on `IConfiguration`
itself, and `set` returns `this` for fluent chaining.

```ts
config.getNum('Server:Port'); // number | undefined
config.getNum('Server:Port', 8080); // number, defaulted
config.getBool('Feature:Enabled', false);
config.get('Server:Timeout', (raw) => Duration.parse(raw)); // custom factory

config.set('Server:Port', '9090').set('Feature:Enabled', 'true'); // fluent
```

## 7. `IndexAccessed` proxy navigation

The reference engine navigates only via `GetSection(key)` chains. Here, the untyped `build()`
result (and every section under it) is a proxy: unknown string keys resolve to further sections,
so `config.Server.Port` dot/bracket navigation type-checks and works at runtime -- while real
members (`get`, `value`, `getSection`, …) always win over the indexer, and the guarded hazards
(not thenable, not iterable, `instanceof` intact) keep it from lying about what it is.

```ts
const config = new ConfigurationBuilder()
  .addInMemoryCollection({ 'Server:Host': 'localhost', 'Server:Port': '8080' })
  .build(); // IndexedSection

config.Server.Port.value; // "8080" -- no getSection() chain needed
config['Server']['Host'].value; // bracket form works too
config.Server.getNum('Port'); // real methods stay reachable mid-navigation
```

## 8. `adoptProvider()` + a stable manager-level reload token

The reference `ConfigurationManager` keeps its provider list correct under concurrent add+read via
a reference-counted copy-on-write scheme -- real complexity earning its keep in a genuinely
multithreaded runtime. There is no concurrent-reader story to preserve in a single-threaded one, so
`ConfigurationManager` uses a simpler, equally-correct seam instead: `ConfigurationRoot.adoptProvider`
builds+loads ONLY the new provider and appends it, never rebuilding (or discarding `set()` state on)
the existing ones. The manager holds its own stable token, subscribed once to the root's
self-swapping one, so a subscriber registered before a later `add()` still fires without the
manager ever needing to swap identity to get that for free.

```ts
const manager = new ConfigurationManager();
manager.set('A', 'mutated'); // works immediately -- a manager always starts with one source
using _sub = ChangeToken.onChange(() => manager.getReloadToken(), notify);

manager.addJsonFile('overrides.json'); // appends + loads ONLY this provider
// "A" keeps its mutated value -- the existing provider was never rebuilt --
// and notify() still fires, even though the subscription predates this add().
```

## 9. An injectable environment map

The reference env provider always reads the ambient process environment; there is no seam to
substitute a fake one. `EnvironmentVariablesConfigurationSourceOptions.env` (defaulting to
`process.env`) lets `load()` run hermetically against a caller-supplied map, so tests -- or any
sandboxed caller -- never have to mutate, and then restore, the real environment.

```ts
const source = new EnvironmentVariablesConfigurationSource({
  prefix: 'APP_',
  env: { APP_Port: '8080' }, // not process.env
});
const provider = source.build(new ConfigurationBuilder());
provider.load(); // pure w.r.t. the injected map -- process.env untouched
```

## 10. Eager switch-mappings validation

The reference engine validates a command-line source's switch-mappings table lazily, inside the
PROVIDER's constructor -- which only ever runs once `build()` is called. Here,
`CommandLineConfigurationSource`'s OWN constructor validates eagerly (every key must start with
`-`; no case-insensitive collisions), so a malformed table fails the moment it is constructed --
strictly earlier than `build()`/`load()` would ever reach it.

```ts
new CommandLineConfigurationSource(process.argv.slice(2), {
  switchMappings: { p: 'Server:Port' }, // missing the leading "-"
});
// throws immediately, at construction -- before .build() is ever called
```

## 11. Compile-time diagnostics with stable codes

The reference engine's reflective binder discovers unsupported shapes at RUNTIME -- throwing, or
in some cases silently skipping them -- since it has no compile-time view of the target type at
all. `config.transformer`'s `.withType<T>()` codegen has the opposite failure mode: an unsupported
field type is a hard COMPILE error with a stable numeric `DiagnosticCode`
(`UnsupportedType`/`NonObjectRoot`) tests can assert on directly, and a failed call is left
completely un-rewritten rather than partially lowered -- there is no silent-partial state to debug.

```ts
interface BadConfig {
  Tags: string[]; // arrays have no Schema representation
}
new ConfigurationBuilder().withType<BadConfig>().build();
// compile error, DiagnosticCode.UnsupportedType (992001) -- the whole
// .withType call is left un-rewritten, never partially codegen'd
```

---

One more cross-cutting note: every capability above is fully usable by hand, with zero build step
-- `withSchema`, `IndexedSection`, `toObject`, the typed accessors, and every `add*` augmentation
are all plain, hand-writable APIs. `config.transformer` is strictly boilerplate deletion on top of
`withSchema`: `.withType<T>()` lowers to EXACTLY the `withSchema({...})` call a plugin-less author
would have written by hand, never adding a capability of its own.
