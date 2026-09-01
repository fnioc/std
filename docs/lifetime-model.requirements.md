# Lifetime model requirements

A lifetime model is a defined pattern of behavior for how long a construction is kept and what
keeps it. How a model organizes itself internally, and what tooling its author has to work with,
is not this document's concern. This document states only what any lifetime model must do and
must never do — behavior a caller outside the model can observe and check.

The engine owns the ask: what was requested and what it takes to satisfy it. The model owns the
scope: whatever grouping of asks it treats as sharing, or not sharing, a construction. A thing
that lives no longer than the one ask that produced it is not a lifetime, and belongs to no
model's vocabulary.

There is no "does nothing" lifetime model to author. A container with no lifetime model installed
is already the case such a model would represent: nothing reads, checks, or acts on any
registration's lifetime.

## Requirements

### Identity

1. A model is an `Addon<Lifetime>` generic in its own vocabulary, and every registration names a
   lifetime from that vocabulary.
2. A failure caused by what a registration's lifetime says, or by what a model does with it,
   identifies to the caller which model raised it.
3. Every model offers at least one lifetime that constructs afresh for every ask and keeps
   nothing: resolving such a registration twice — from the same scope, or from different ones —
   never yields the same instance.

### No fixed shape

4. No two models are required to agree on how they organize themselves: how many kinds of scope
   exist, how they nest, what marks one, or what a failure specific to one model looks like beyond
   requirement 2. Neither a caller nor another model may assume one model's shape from having seen
   another's.
5. No lifetime model is required at all. A container with none installed behaves exactly as if a
   model that interprets nothing were present.

### The unit of "single"

6. The unit of "single" is the answering registration together with its generic capture — never
   the spelling a caller happened to ask with. Two different spellings that resolve to the same
   registration, closed the same way, share one instance under a keeping lifetime:
   ```ts
   // resolved directly, and resolved as a constructor dependency of something else —
   // both routes reach the same registration, so both get the same instance.
   const direct = provider.resolve(WIDGET);
   const viaDependent = (provider.resolve(HOLDER) as Holder).widget;
   direct === viaDependent; // true, under a keeping lifetime
   ```
7. One open-generic registration, closed two different ways, is two different "single"s — never
   conflated into one instance:
   ```ts
   provider.resolve(typefor<Repo<number>>()) !== provider.resolve(typefor<Repo<string>>());
   // same open registration answers both; each closed spelling keeps its own instance
   ```

### Concurrency and async-blindness

8. Under a keeping lifetime, two asks for the same registration and the same generic capture, made
   concurrently, are answered with the identical product — never two separately constructed ones —
   whichever of the two asks finishes first.
9. This holds identically when a construction's product is a still-pending promise: a second
   concurrent ask for the same kept single is answered with that very same pending promise, not a
   fresh one.
10. A kept construction whose product is a promise is handed back exactly as constructed —
    pending, settled, or rejected — never awaited, unwrapped, or substituted for something else on
    the way to a caller asking for the raw value:
    ```ts
    const pending = provider.resolve(WIDGET); // this registration's construction returns a promise
    pending instanceof Promise; // true
    pending === provider.resolve(WIDGET); // true, under a keeping lifetime — the very same
    // pending promise handed back again, never awaited or replaced by what it settles to
    ```

### Latebound arguments

11. A value built from a latebound argument — supplied by the caller at the moment of the ask
    rather than carried on the registration or the closed address — is never kept by a model. The
    address that would key a cached slot for it carries no record of those arguments, so there is
    nothing stable to key the slot on. This reaches exactly as far as the arguments do: something
    resolved during the same call whose own dependencies never touched a latebound argument is kept
    exactly as it would have been outside that call, and a caller can observe it is the same
    instance they would get by asking directly. A model that declines to keep everything reached
    from a latebound call is refusing more than it was asked to:
    ```ts
    const make = provider.resolve(Type.func(WIDGET, [[Type.string()]])) as (name: string) => Widget;
    make('a') !== make('b'); // never conflated, whatever the registration's own lifetime says
    ```

### Disposal

12. Two different models are never required to release, or even track, kept constructions the same
    way, on the same trigger, or at all. A caller must not assume disposal behavior carries over
    from one model to another.
13. For a construction under a lifetime that keeps nothing, whether it is disposed at all, and by
    what, is a decision that belongs to the model that constructed it — not fixed by anything
    outside that model, and not necessarily the same choice two different models make. A model may
    expose this choice as something a caller configures.
14. A registration handed back exactly as given, never constructed by anything, is never something
    a model disposes as though it had built it.

### Captivity

15. Whether a registration that lives longer may depend on, and hold onto, one that lives for a
    shorter span is a question no two models are required to answer alike. Nothing outside the
    model deciding it supplies a default answer, a check, or an error naming the situation, and a
    check one model performs for this is never shared with or imposed on another model.

## Over-specified tests to cut

- **A scoped registration resolved at the root scope is refused by default.**
  `tests/di.test/test/standard-lifetime-model.test.ts`, `describe('scoped')` → `'refuses a scoped
  ask at the root scope'`, and the `'the two validation switches'` block asserting both switches
  are "on by default." The reference's scope-validation switch defaults OFF: resolving a
  scope-limited registration from the root, with no validation turned on, silently succeeds and
  the root itself keeps the instance (captive-at-root, not a refusal). A model may choose to
  refuse this by default, but nothing requires it, and the reference's own default is the
  opposite.

- **A pending promise product is awaited during release, and a synchronous release throws on
  meeting one.** `tests/di.test/test/standard-lifetime-model-disposal.test.ts`,
  `describe('the promise-boundary product in reach')` and its sync-throw counterpart. This
  directly contradicts requirement 10: a kept promise is never awaited or unwrapped by the model.
  The reference has no async construction at all, so there is no reference behavior to match
  here — the contradiction is with the async-blindness requirement itself.

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
  reused for a second ask. Not tracking transient disposables is a legitimate choice a model may
  make (requirement 13), but asserting it as the required behavior misstates the reference.

- **Opening a nested scope from an already-disposed non-root scope is refused, even while that
  scope's own root is still alive.** `describe('opening a scope from a disposed factory')` in both
  `standard-lifetime-model-disposal.test.ts` and `tagged-lifetime-model.test.ts`. In the
  reference, opening a new scope delegates straight to the root's own disposed check; a non-root
  scope's own disposed state does not gate creating a further scope from it. A model may choose to
  be stricter, but the reference itself is not.

- **A generic captive-dependency error and check, shared across models rather than each model's
  own.** `tests/di.test/test/validation-addon.test.ts` and
  `tests/di.test/test/captivity-constant-products.test.ts` both exercise a captivity error and a
  reusable captivity check imported from a shared library rather than authored per model. This
  contradicts requirement 15 directly: captivity checking is each model's own, never a check
  shared between models.

- **A `noopLifetimeAddon` that a container installs to get "no lifetime interpretation."**
  `tests/di.test/test/async-resolution.test.ts` builds its provider through
  `di.usingLifetimeModel(noopLifetimeAddon())`. This is exactly the model requirement 5 rules
  out: a container with no model installed is already what such a model would be — nothing to
  author or install to reach that state.
