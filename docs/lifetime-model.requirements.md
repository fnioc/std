# Lifetime model requirements

A lifetime model is a defined pattern of behavior for how long a construction is kept and what
keeps it. It is an `Addon<Lifetime>`: registrations it files, and middleware that composes into
the container's one request pipeline, generic in a vocabulary of its own choosing — the
`Lifetime` type parameter names whatever data a registration's `lifetime` member carries for this
model to interpret. Nothing outside the model reads that member; nothing outside the model
prescribes what values it may hold.

The boundary the model sits on is fixed and small: nothing in the manifest, the engine, or the
chain says how a model organizes itself. Two models need not be built alike.

The engine owns the ask: what was requested, its address, and the constructions it takes to
satisfy it. The model owns the scope: whatever grouping of asks it defines as sharing (or not
sharing) a construction. A per-ask thing — data that lives no longer than the resolution that
created it — is not a lifetime and belongs to no model's vocabulary; the engine already tracks the
ask itself without any model's help.

There is no "does nothing" lifetime model to author. Installing a model is optional outright — a
container with none installed is already the case a no-op model would represent: nothing reads
the `lifetime` member of any registration, because nothing installed knows how.

## Requirements

### Vocabulary and identity

1. A lifetime model is an `Addon<Lifetime>` in a vocabulary of its own choosing; nothing about
   that vocabulary's shape — a string tag, an enum, an object, a union of literals — is
   prescribed.
2. A model names itself, so a failure can say which model refused:
   ```ts
   const model = myLifetimeAddon();
   model.name; // "standard", "tagged", whatever this model calls itself
   ```
3. A model publishes its own value for "construct afresh, keep nothing" — its `transient` — in
   its own vocabulary. A registration carrying that value is never kept by anything the model
   installs.
4. Every registration a model's own addon files, and every registration a caller adds under that
   model, carries a `lifetime` drawn from the model's vocabulary (or the engine-owned
   `controlLifetime` sentinel, which is outside every model's jurisdiction and never reaches the
   model at all). A registration naming no lifetime the model recognizes is the model's own to
   refuse, at whatever point it chooses to check.

### Scope ownership

5. The model owns scopes. It defines how many kinds exist, how they nest, what data marks one,
   and how a caller opens one — none of it named or shaped by the engine, the manifest, or the
   hook chain.
6. A per-ask thing — a value that lives no longer than the one resolution that produced it — is
   never a lifetime. The engine already tracks the ask; a model's vocabulary describes only what
   outlives it.
7. Where a model publishes a way to open a nested scope, that surface — its address, its shape,
   what it's called — is the model's own invention. Nothing elsewhere in the container names or
   expects it.

### The unit of "single"

8. The unit of "single" is the answering registration together with its generic capture — never
   the spelling a caller happened to ask with. Two different spellings that resolve to the same
   registration, closed the same way, share one instance under a keeping lifetime:
   ```ts
   // resolved directly, and resolved as a constructor dependency of something else —
   // both routes reach the same registration, so both get the same instance.
   const direct = provider.resolve(WIDGET);
   const viaDependent = (provider.resolve(HOLDER) as Holder).widget;
   direct === viaDependent; // true, under a keeping lifetime
   ```
9. One open-generic registration, closed two different ways, is two different "single"s — never
   conflated into one instance:
   ```ts
   provider.resolve(typefor<Repo<number>>()) !== provider.resolve(typefor<Repo<string>>());
   // same open registration answers both; each closed spelling keeps its own instance
   ```

### Concurrency and async-blindness

10. A model must never construct the same thing twice for one lifetime. Concurrent asks for the
    same answering registration and the same generic capture, under a keeping lifetime, settle on
    one product — the second ask in reaches the first ask's in-flight or already-settled result,
    never a fresh construction.
11. This holds for asynchronous products exactly as it holds for synchronous ones: a construction
    that produces a pending promise is the product being kept, and a second concurrent ask for the
    same single reaches that same pending promise rather than starting its own construction.
12. A model is async-blind. It never insists on a settled value, never calls `.then` on what it's
    keeping, never awaits a product before deciding whether or how to keep it, and never treats a
    pending promise differently from any other value the engine handed it.

### Latebound arguments

13. A value built from a latebound argument — supplied by the caller at the moment of the ask
    rather than carried on the registration or the closed address — is never kept by a model. The
    address that would key a cached slot for it carries no record of those arguments, so there is
    nothing stable to key the slot on:
    ```ts
    const make = provider.resolve(Type.func(WIDGET, [[Type.string()]])) as (name: string) => Widget;
    make('a') !== make('b'); // never conflated, whatever the registration's own lifetime says
    ```

### Disposal

14. Instance disposal belongs entirely to the model. The engine, the manifest, and the hook chain
    carry no disposal contract of any kind — no dispose-shaped hook a model is expected to
    implement, no dispose-named error in the shared taxonomy, nothing.
15. Where a model chooses to track constructed instances for later release, the mechanism for
    triggering that release — what it's called, how a caller reaches it, whether it distinguishes
    a synchronous release from an asynchronous one — is the model's own invention. Nothing
    elsewhere in the container calls it, awaits it, or assumes its shape.
16. A registration whose implementer the engine never constructs — a value registration, handed
    back exactly as given — has no construction for a model's disposal policy to govern, and a
    model must never treat one as an instance it tracks.

### Captivity and validation

17. Whether a longer-lived registration may depend on a shorter-lived one — captivity, where the
    longer-lived one constructs the shorter-lived one and holds it past that dependency's own
    lifetime — is the model's own judgment call. Nothing in the engine, the manifest, or the hook
    chain supplies a captivity check, an error naming one, or an opinion on whether captivity is
    ever acceptable.
18. Where a model wants such a check, it authors it as a middleware layer of its own, inside its
    own addon — reading whatever the model's own registrations and vocabulary already expose. It
    is never contributed by the engine, and never a type or a check shared with another model:
    each model that wants captivity checking writes its own.

### Composition

19. A lifetime model is an `Addon<Lifetime>` and nothing more: its registrations file the way any
    addon's do, its middleware composes into the one chain the way any addon's does, and a
    container may run with one installed, several installed side by side under different
    vocabularies, or none at all. Two models need not organize their scopes alike, name their
    errors alike, or agree on what "kept" even means beyond the shared boundary above.

## Over-specified tests to cut

- **A scoped registration resolved at the root scope is refused by default.**
  `tests/di.test/test/standard-lifetime-model.test.ts`, `describe('scoped')` → `'refuses a scoped
  ask at the root scope'`, and the `'the two validation switches'` block asserting both switches
  are "on by default." The reference's scope-validation option defaults OFF: resolving a
  scope-limited registration from the root, with no validation installed, silently succeeds and
  the root itself keeps the instance (captive-at-root, not a refusal). A model may choose to
  refuse this by default, but nothing about the reference — or about requirement 17 above —
  requires it, and the reference's own default is the opposite.

- **A pending promise product is awaited during release, and a synchronous release throws on
  meeting one.** `tests/di.test/test/standard-lifetime-model-disposal.test.ts`,
  `describe('the promise-boundary product in reach')` and its sync-throw counterpart. This
  directly contradicts requirement 12: a model is async-blind and never awaits a product it keeps,
  release included. The reference has no async construction at all, so there is no reference
  behavior to match here — the contradiction is with the model's own async-blindness requirement,
  not with reference parity.

- **Disposing a scope cascades into disposing every open child scope before releasing what the
  parent itself kept.** Same file, `describe('release order')` →
  `'tears a child scope down before releasing what the parent itself kept'`. The reference does
  not track open child scopes from a parent at all: disposing a parent scope does not touch a
  child scope that is still open, and a child scope's own disposal is entirely the caller's
  responsibility. A "children-before-parent" cascade is not reference behavior.

- **A transient (never-kept) instance is never tracked for disposal.**
  `describe('what the model never tracks')` → `'never disposes a transient instance, since nothing
  tracks it'`. This is backwards from the reference: a transient disposable IS captured by the
  scope that constructed it and IS released when that scope tears down — it is simply never
  reused for a second ask. Not tracking transient disposables is a legitimate design choice a
  model may make, but asserting it as the required behavior misstates the reference.

- **Opening a nested scope from an already-disposed non-root scope is refused, even while the
  scope's own root provider is still alive.** `describe('opening a scope from a disposed
  factory')` in both `standard-lifetime-model-disposal.test.ts` and
  `tagged-lifetime-model.test.ts`. In the reference, opening a new scope delegates straight to the
  root provider's own disposed check; a non-root scope's own disposed state does not gate creating
  a further scope from it. A model may choose to be stricter, but the reference itself is not.

- **A generic, engine-shared `CaptiveDependencyError` and a standalone captivity-sweep addon
  usable across models.** `tests/di.test/test/validation-addon.test.ts` and
  `tests/di.test/test/captivity-constant-products.test.ts` both exercise a captivity error and
  validator imported from the shared surface rather than authored inside one model's own addon.
  This contradicts requirement 18 directly: captivity checking is each model's own, never a type
  or a check shared between models.

- **A `noopLifetimeAddon` that a container installs to get "no lifetime interpretation."**
  `tests/di.test/test/async-resolution.test.ts` builds its provider through
  `di.usingLifetimeModel(noopLifetimeAddon())`. This is exactly the model the opening section
  above rules out: a container with no model installed is already what a no-op model would be: no
  need to author or install one to reach that state.
