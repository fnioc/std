# Justified divergences from ME

Accepted, owner-signed-off departures from the ME reference. Each is deliberate and justified. Foundational patterns are specified in the requirements doc; this file records only the sanctioned divergences, and grows as more are reviewed and signed off.

## Foundational pattern — recorded here, specified in requirements

**The augmentations pattern.** We emulate C#'s extension methods with a named object-literal set installed on the receiver's prototype at runtime (the registry + `@augment`) plus a `declare module` interface merge for the types — because TypeScript has no non-invasive way to attach a method to a type. Load-bearing; its full treatment lives in the requirements doc. Recorded here only so the departure from ME's extension-method mechanism is on the books.

## Divergences

### MECB (configuration Binder) — not ported

We do not port ME's reflective `ConfigurationBinder` (`Get<T>` / `Bind` / `GetValue<T>`). Reflective binding is impossible in TypeScript: types are erased at runtime, so there is no shape to reflect over. Binding is covered instead by config's own `bindConfig`, `config.transformer`'s `withType<T>` sugar, and the factory-driven `IConfiguration.get<T>(path, factory)`.

### Environment-agnosticism, declared via `types[]`

ME has no notion of a target runtime environment; we add one. **Non-provider libraries are environment-agnostic; provider libraries declare their target environment via the tsconfig `types[]` array** — empty `types[]` ⟺ agnostic, non-empty ⟺ a declared provider for that environment (`["node"]`, `["dom"]`, …). A design rule with no ME analog.
