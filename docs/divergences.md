# Justified divergences from ME

Accepted, owner-signed-off departures from the ME reference. Each is deliberate and justified. Foundational patterns are specified in the requirements docs (`docs/features/augmentations.md`, each family's own `docs/libraries/*.md`); this file records only the sanctioned divergences, and grows as more are reviewed and signed off.

## Foundational pattern — recorded here, specified elsewhere

**The augmentations pattern** (our stand-in for C#'s extension methods) is documented in full at
`docs/features/augmentations.md`; `docs/decisions.v2.md` §89 rules that doc the sole place it's described.
Recorded here only so the departure from ME's extension-method mechanism is on the books.

## Divergences

### MECB (configuration Binder) — not ported

We do not port ME's reflective `ConfigurationBinder` (`Get<T>` / `Bind` / `GetValue<T>`). Reflective binding is impossible in TypeScript: types are erased at runtime, so there is no shape to reflect over. What we built instead — a runtime-inspectable `Schema` (Tier 1) plus `config.transformer`'s `withType<T>` codegen (Tier 2), and the factory-driven `IConfig.get<T>(path, factory)` — is documented as a positive feature in `docs/libraries/config.md` §2 and §6.

### Environment-agnosticism, declared via `types[]`

ME has no notion of a target runtime environment; we add one. **Non-provider libraries are environment-agnostic; provider libraries declare their target environment via the tsconfig `types[]` array** — empty `types[]` ⟺ agnostic, non-empty ⟺ a declared provider for that environment (`["node"]`, `["dom"]`, …). A design rule with no ME analog.

### Sync-only options validation

Options validation is synchronous and resolution lazy by design, so ME's async validation family — `IAsyncValidateOptions<T>` and `IAsyncStartupValidator` — is not ported. The **sync** path IS ported and stays in: `IStartupValidator`/`StartupValidator` and the `validateOnStart` manifest verb (§55). ME's carve-out wording that lumps `IStartupValidator`/`ValidateOnStart` in with the async-out family is imprecise — only the async pieces are out. Recorded in decisions.md §76.

### `OptionsFactory` is not a DI seam

ME exposes `IOptionsFactory<T>` as a DI-swappable interface so a consumer can substitute pipeline assembly. Here `OptionsFactory<T>` is a concrete class with no interface or token — YAGNI, no consumer needs factory substitution. Reopen if one does. Recorded in decisions.md §76.

### Deep-merge config bind

ME's config→options bind (`NamedConfigureFromConfigurationOptions`) calls the reflective `ConfigurationBinder.Bind`. Reflection is impossible under TS type erasure, so `ConfigConfigureOptions`/`bindSection` reimplements the bind **structurally** as a deep merge of the section's key/value subtree onto the value. Beyond just being reflection-free, the deep merge carries a stronger guarantee than ME's `Bind`: two configure steps binding overlapping sections **compose** rather than clobber each other's nested keys. Recorded in decisions.md §76.

### Registration delegates return the collection

ME's registration-time delegates are `Action`s — `IHostBuilder.ConfigureServices(Action<HostBuilderContext, IServiceCollection>)`, and every callback shaped like it — because `IServiceCollection` is a mutable list the delegate registers INTO; nothing needs to come back out. Here, `ServiceManifest` is immutable (§107/§108 — every registration verb and chain modifier returns a NEW manifest, never mutates its receiver), so a delegate with no manifest to write through has nowhere to put its registrations except its return value. Every such delegate is therefore a `Func` that takes the incoming manifest and returns the one carrying its additions, not a void `Action`: `IHostBuilder.configureServices`/`configureContainer` and every other registration-time callback in this port follow this shape. A void `Action` here would typecheck and silently register nothing — the `Func` signature is what makes the immutability the caller's problem to get right, at the type level, everywhere a delegate registers, not just at these two call sites.

```ts
// ME: void delegate mutates the collection it's handed
hostBuilder.ConfigureServices((context, services) => {
  services.AddSingleton<ILogger, ConsoleLogger>();
});

// here: the delegate returns the manifest carrying its additions
hostBuilder.configureServices((context, services) =>
  services.addClass<ILogger>(ConsoleLogger).as<'singleton'>()
);
```
