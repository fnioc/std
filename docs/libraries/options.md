# `@rhombus-std/options`

The collapsed `Options<T>` accessor + the configure / post-configure / validate `OptionsFactory`
pipeline, plus startup validation (`IStartupValidator`/`StartupValidator`, forced by `Host.start`)
and `ValidateOptionsResultBuilder` for multi-failure aggregation. `options.augmentations` is the
one place di and config meet — the config→`Options<T>` bridge — and exports the pipeline
slot-token grammar (`configureStepToken` et al.) so a downstream package can register a step for a
type it doesn't own.

## Justified divergences

`@rhombus-std/options` mirrors the reference options stack (its `IOptions`/`IOptionsSnapshot`/
`IOptionsMonitor` accessors and configure / post-configure / validate pipeline) faithfully, then
goes further in several directions the reference has no equivalent for. Each entry below assumes
you already know those reference accessors; it only covers what's new. Snippets are grounded in
the real tests and examples (`tests/options.augmentations.test/**`, `examples/examples.app.*`) —
an ambient `services` is a `ServiceManifest` being built (the `IServiceCollection` analog),
`provider` is `services.build()` scoped, and tokens are plain strings (no transformer).

### 1. One `Options<T>.value` accessor over three reference interfaces

The reference splits the accessor three ways — `IOptions<T>` (singleton snapshot),
`IOptionsSnapshot<T>` (scoped), `IOptionsMonitor<T>.CurrentValue` (reactive). The
singleton-vs-scoped split is a fixed-lifetime DI artifact; here scopes are open-ended and lifetime
is a registration concern, so all three collapse into one `value` getter.

```ts
export interface Options<T> {
  readonly value: T;
  subscribe?(listener: Func<[T], void>): Disposable; // present only when reload-capable
}
```

You register once and read `.value` regardless of how the value was produced — a static snapshot
or a live-reloading one.

### 2. Change-token reactivity with no DI and no builder

The reactive capability (the reference's `IOptionsMonitor.OnChange`) is orthogonal to lifetime, so
it survives as `subscribe` — and `Options.watch` gives you a live options object standalone, with
no container and no options-builder at all. `.value` re-reads on every access; `subscribe`
re-arms the next change token automatically after each fire.

```ts
// libraries/options/src/options.ts
function watch<T>(getValue: Func<[], T>,
  produceToken: ChangeTokenProducer): Options<T>
{
  return {
    get value(): T {
      return getValue();
    },
    subscribe(listener: Func<[T], void>): Disposable {
      return ChangeToken.onChange(produceToken, () => listener(getValue()));
    },
  };
}
```

Backed by a config reload token, a subscriber sees every reload without re-subscribing
(`config-options.test.ts`):

```ts
const options = provider.resolve<Options<WidgetOptions>>(TOKEN);
const seen: WidgetOptions[] = [];
options.subscribe!((value) => seen.push(value));

config.set('Widget:Url', 'http://second');
config.reload();

expect(seen).toEqual([{ Url: 'http://second' }]);
```

### 3. An explicit-token `addOptions(token, tToken)` wrap verb

Alongside the assembly-pipeline overload (`addOptions(token, () => base)` — runs the whole
configure/post-configure/validate pipeline), a second verb wraps an _already-bound_ `T` into an
`Options<T>`. Same member name, disambiguated by whether the second argument is a base factory or
a token.

```ts
// examples/examples.app.without-transformer/src/main.ts
services.addOptions(POLICY_OPTIONS_TOKEN, POLICY_TOKEN).as('singleton');
// lowers to: addFactory(token, (t) => Options.of(t), [[POLICY_TOKEN]])
```

The reference has no "wrap an existing registration as options" verb — you would register a
factory by hand.

### 4. `addOptions<T>()` type-driven sugar (`di.transformer.options`)

The `di.transformer.options` satellite lowers a token-free `addOptions<T>()` to the explicit wrap
verb above — you name the options type, the transformer derives both tokens.

```ts
// examples/examples.app.with-transformer/src/main.ts
services.addOptions<GreetingPolicy>().as('singleton');
// lowers to: services.addOptions(token(Options<GreetingPolicy>), token(GreetingPolicy))
```

Per the no-transformer-first rule this is pure ergonomics — it rewrites to exactly what #3 does by
hand, adding no capability.

### 5. The pipeline slot-token grammar is public API

The reference hides its per-options pipeline registrations behind named-options internals. Here
the slot tokens are a derived, public grammar (`configureStepToken`, `postConfigureStepToken`,
`validateStepToken`, `changeTokenSourceToken`) — so a downstream package can append a pipeline step
for a `TOptions` it doesn't own, by deriving the same slot token the assembly reads.

```ts
// libraries/options.augmentations/src/option-tokens.ts
export function configureStepToken(optionsToken: Token): Token {
  return `${NAMESPACE}/configure/${optionsToken}`;
}
```

Registering a step is just `addValue(configureStepToken(token), step)` — the same call the
`configure` augmentation makes internally, now reachable by any consumer.

### 6. DI-injected pipeline steps via a variadic `DepTokens` form

The reference generates `ConfigureNamedOptions<TDep1..5>` closure classes, one per dependency
arity (up to five). Here a single variadic form takes a dep-token tuple; the deps resolve once at
pipeline-assembly and are passed to the callback after the options value — any arity, no generated
closures.

```ts
// tests/options.augmentations.test/test/di-injected-steps.test.ts
services.configure<WidgetOptions, [UrlProvider, { attempts: number; }]>(
  OPTIONS_TOKEN,
  [URL_PROVIDER_TOKEN, RETRY_POLICY_TOKEN],
  (options, urls, policy) => {
    options.url = urls.base;
    options.retries = policy.attempts;
  },
);
```

The same variadic form serves `postConfigure` and `validate`.

### 7. A step object _or_ a delegate on the one verb

The reference needs a separate raw DI registration to supply a pre-built `IPostConfigureOptions`
instance. Here `configure`/`postConfigure`/`validate` each accept a pre-built step object _or_ a
bare delegate on the same verb.

```ts
// tests/options.augmentations.test/test/post-configure.test.ts
services.postConfigure<WidgetOptions>(OPTIONS_TOKEN, (options) => {
  options.suffix += '!'; // delegate
});
services.postConfigure<WidgetOptions>(OPTIONS_TOKEN, {
  postConfigure(options) {
    options.suffix += '!'; // pre-built PostConfigureOptions<T>
  },
});
```

Both append to the token's post-configure slot, which the assembly runs after every configure
step.

### 8. Structural deep-merge config bind that composes overlapping sections

The reference's config→options bind calls the reflective `ConfigurationBinder.Bind`. Reflection is
impossible under TS type erasure, so `ConfigurationConfigureOptions` reimplements the bind
_structurally_ — and the deep merge carries a stronger guarantee than the reference: two configure
steps binding overlapping sections **compose** rather than clobber each other's nested keys.
Owner-signed-off divergence (`decisions.md` §76).

```ts
// libraries/options.augmentations/src/ConfigurationConfigureOptions.ts
function bindSection(config: IConfiguration,
  target: Record<string, unknown>): void
{
  for (const child of config.getChildren()) {
    const grandchildren = [...child.getChildren()];
    if (grandchildren.length) {
      const existing = target[child.key];
      const nested = (typeof existing === 'object' && existing !== null)
        ? existing as Record<string, unknown>
        : {};
      target[child.key] = nested;
      bindSection(child, nested); // recurse — compose, don't clobber
    } else if (child.value !== undefined) {
      target[child.key] = child.value;
    }
  }
}
```

Two sections merged into one value (`config-options.test.ts`):

```ts
services.configure(TOKEN, config.getSection('Widget')); // { Url: 'http://a' }
services.configure(TOKEN, config.getSection('Extra')); //  { Retries: '5' }
expect(options.value).toEqual({ Url: 'http://a', Retries: '5' }); // composed
```

### 9. Sync-only options validation

Options validation is synchronous and resolution lazy by design, so the reference's async
validation family — `IAsyncValidateOptions<T>` and `IAsyncStartupValidator` — is not ported. The
**sync** path IS ported and stays in: `IStartupValidator`/`StartupValidator` and the
`validateOnStart` manifest verb (§55). The reference's carve-out wording that lumps
`IStartupValidator`/`ValidateOnStart` in with the async-out family is imprecise — only the async
pieces are out. Owner-signed-off divergence (`decisions.md` §76).

### 10. `OptionsFactory` is not a DI seam

The reference exposes `IOptionsFactory<T>` as a DI-swappable interface so a consumer can substitute
pipeline assembly. Here `OptionsFactory<T>` is a concrete class with no interface or token —
YAGNI, no consumer needs factory substitution. Reopen if one does. Owner-signed-off divergence
(`decisions.md` §76).
