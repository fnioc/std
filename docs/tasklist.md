# Tasklist

Open work items. An item lands here when it is decided but not yet done; it leaves when the change is in.
Architectural rulings belong in `decisions.user.md` (gospel) or `decisions.v2.md` — this file tracks execution only.

## Descriptor validity

- [ ] **Make implementer/serviceType assignability gospel.** Author the entry in `decisions.user.md`:

  > A descriptor's implementer must produce a value assignable to its `serviceType` — the value itself for a
  > value registration, the construct result for a ctor, the call result for a factory. A registration whose
  > declared type no value of it satisfies is invalid, not merely unusual. This is what makes validation
  > possible at all: without it the descriptor graph carries no checkable claim.

- [ ] **Audit existing registrations against the rule** once it is gospel. The sentinel slots below are the known
      violations; there may be others.

## Finish converting `Type | string` away (U6)

A parameter that names a type takes a `Type` and nothing else; a consumer holding a string writes `Type.from(...)`
at the call. Most sites are already converted by hand. What remains:

- [ ] `libraries/di.core/src/builder.ts` — `withSignature` / `withSignatures` parameter rows and the `signatures`
      state member (`:46`, `:54`, `:90`, `:145`, `:149`), plus the commented `describe` at `:256`. These disappear
      entirely if the door-collapse item below lands first, so sequence that one ahead of this.
- [ ] `libraries/di/src/ServiceProvider.ts` — `getService` and the resolve family (`:34`, `:53`, `:90`, `:100`).
- [ ] `libraries/primitives/src/augmentation/registry.ts` — `registerAugmentations`, `augment`, and the
      `receiverType` normalizer they share (`:57`, `:87`, `:119`); the normalizer goes with them.
- [ ] `libraries/primitives/src/Type/Type.ts` — `Signatures.from` (`:163`).
- [ ] `libraries/logging.config/` — `ILoggerProviderConfigFactory.getConfig`, `LoggerProviderConfigFactory`
      `getConfig`, and `registerProviderOptions`'s two parameters.
- [ ] Re-sweep for `Type | string` and `string | Type` afterwards.

## Kill the sentinel slots

`libraries/options.augmentations/src/option-types.ts` fabricates global type names and registers values under them
that have no relationship to the name. `add(startupValidationTargetType(), optionsAddressType(type))` declares a
service type nothing in the program is ever of, and stores a `Type` node under it. Every one of these is a bucket
key wearing a type's clothes, with `[optionsType]` standing in for a composite key component rather than a type
argument.

- [ ] `configureStepType` → the real type is `IConfigureOptions`, distinct per options type:
      `Type.imported('IConfigureOptions', '@rhombus-std/options', [optionsType])`.
- [ ] `postConfigureStepType` → `IPostConfigureOptions<T>`, same shape.
- [ ] `validateStepType` → `IValidateOptions<T>`, same shape.
- [ ] `changeTokenSourceType` → the change-token source type, same shape.
- [ ] `baseFactoryType` → a `Type.func` — it holds a `() => T`.
- [ ] `startupValidationTargetType` → the genuine keyed case: a flat list of `Type` values with no per-element type
      to key on. Spell it `Keyed<Type, K>` rather than a fabricated global.
- [ ] **Any package-qualified name that survives moves from `Type.global` to `Type.imported`.** A global names the
      ambient scope and has no `from` member; string-concatenating a package specifier into a global name is doing
      that member's job by hand.
- [ ] Sweep the other families for the same pattern — `option-types.ts` is where it was found, not necessarily the
      only place it lives.

## Authoring surface

- [ ] **Accept `Keyed<T, K>` in the pipeline verbs' `type` position.** The derivation already supports it:
      `DeriveTyped` checks the `Keyed` brand ahead of construct/call signatures and emits a `tag` node over the
      stripped base (`transforms/internal/tokens/derived.go:49-65`), so `typefor<Keyed<T, 'k'>>()` is equivalent to
      `Type.tag(typefor<T>(), 'k')`. What is missing is the verbs accepting and threading it.

- [ ] **Collapse the type door into the implementer door.** The chain currently names the implementer and its type
      in two steps, and `withSignature(...paramTypes)` can only spell parameter rows
      (`libraries/di.core/src/builder.ts:145`) — no `return` after `asFactory`, no `instance` after `asClass`,
      which is why the errors at `:200`/`:220` can only point at `withType`. Make each door take both:

      ```ts
      asClass(ctor: Ctor, ctorType: ConstructorType): …      // primitive
      asFactory(fn: Func, fnType: FunctionType): …
      ```

      and give each a one-argument-shorter sugar in `di.extras` that derives the type:

      ```ts
      asClass<T extends Ctor>(this: …, ctor: T): … {
        return this.asClass(ctor, typefor<T>());
      }
      ```

      This removes `withType` / `withSignature` / `withSignatures`, the `Slots`/`Ready` tracking for the type slot,
      the one-of-three-doors invariant, and the runtime guard at `:126` that polices it. A whole node is written
      with the structured factory forms, which is what they are for.

      The sugar is always **exactly one argument shorter** than the primitive it lowers to. That is what makes it
      terminate: the emitted call resolves to a different overload, so the fixed-point loop cannot re-enter it.
      Adopt this as the general rule for type-taking primitives — `add(type, impl, implType)` gets `add<T>(impl)`
      by the same shape — so termination is stated rather than incidental.

- [ ] **Give `ValueServiceDescriptor` an implementer-type argument, and thread it up the chain.** A value
      registration then lowers to `add(type, value, valueType)` — the same three-argument shape as the ctor and
      factory forms, with the implementer type's kind selecting between them. One sugar body serves all three:

      ```ts
      add<T>(this: Manifest, implementer: unknown, ...rest: any[]): Manifest {
        return this.add.apply(this, [typefor<T>(), implementer, typefor(implementer), ...rest] as any);
      }
      ```

      This is what lets the flat verbs derive the implementer type without the author writing it, and it keeps one
      body per member name per package. A value that is itself a function reads as a factory under kind selection;
      the builder's `asValue` door is the explicit spelling for that case.

### Land the uniform `add` — descriptors as values, implementer type observed

The verbs converge on one shape: the author names the SERVICE type and hands over the implementer; the implementer
TYPE is observed from it. Every `add` door then shares one sugar body, and the only thing choosing ctor vs factory
vs value is the kind of the observed type. Sequence this after the two items above — the value descriptor's
implementer-type argument is what makes the three doors uniform, and the type-door collapse reshapes the very
chain step 2 exposes.

- [ ] **Drop the `add(configure)` lambda overload.** It is the one `add` shape whose second argument is not an
      implementer, so `typefor(value)` would observe the CALLBACK and derive a factory type for it — the single
      thing preventing a uniform body. `IComplete` stops being a marker on a callback's return and becomes
      ordinary assignability at the argument position.
- [ ] **Export the descriptor builder as a value producer.** Its terminal is a `ServiceDescriptor`, handed to the
      descriptor-taking primitive that already exists. Descriptors become first-class: built in a helper, held in
      a variable, iterated. Undecided — the builder factory takes the manifest, the manifest hands out the
      builder, or (no threading) the descriptor carries its scope as `ServiceDescriptor<S>` and
      `Manifest<Scopes>.add` accepts only `ServiceDescriptor<Scopes>`, with an unscoped descriptor's `never`
      making the plain case fall out. The third is the only one under which a library can author a descriptor at
      module scope without a manifest in hand.
- [ ] **Collapse the faces to `add<T>(implementer, scope?)`.** With the implementer type observed, no caller
      writes `ctorType`/`factoryType`. `libraries/di.extras/src/augmentations/Manifest-Descriptor-augmentations.ts`
      has this done for `add` (`:8`-`:10`) and not for `tryAdd`/`replace` (`:14`, `:15`, `:18`, `:19`), whose faces
      still take the type argument their bodies never pass.
- [ ] **Decide how the value door is spelled, and make the emit follow the resolved overload.** The face already
      separates them — `add<T>(factory: Func<any[], T>)` is a function RETURNING T, `add<T>(value: T)` is a
      function that IS T — and TypeScript binds them correctly. The shared body then discards that: `typefor`
      sees call signatures and emits a `FunctionType`, so the face says value and the emit says factory. Either
      the emit varies by the overload the checker resolved (which #365's claiming already computes) or `addValue`
      stays a verb of its own. A steering argument on `typefor` is not the answer — the registration kind is a di
      concept and the primitive is domain-agnostic.
- [ ] **Document the cast as the impl-type steering mechanism**, and its boundary. A cast changes the observed
      signature's SHAPE — parameter rows, return, an overload row, a `Keyed<T, K>` slot naming a keyed
      registration the function's own parameters cannot — because derivation reads the checker's type for the
      argument expression. It cannot change the KIND: every type a callable is assignable to still carries call
      signatures, so crossing the value/factory line needs a double assertion that misdescribes the value. Kind
      is chosen by the door, shape by the cast. A stale cast silently rewrites the injection list, which is the
      failure worth calling out at the call site.
- [ ] **Restate the termination rule.** The sugar is now TWO arguments shorter than the primitive, not one — type
      and implementer type are both derived. Termination still holds because the emitted call binds a different
      overload; the wording above ("exactly one argument shorter") describes a shape this supersedes.

- [ ] **`typefor<T>()` on a named type must type as the node it yields.** `TypeFor<T>` narrows only the two
      callable kinds and drops everything else to the full `Type` union, so `typefor<Type>()` types as `Type` when
      the value is an `ImportedType`. A named type argument should type as its `ImportedType` (an ambient one as
      its `GlobalType`), which means the fallback branch narrows to `NominalType`. Settle what `typefor` yields
      for an unnamed type argument first: if naming is total the narrowing is unconditional, and if an anonymous
      shape yields a structural node the fallback needs a branch for it.

A `Keyed<Type, K>` sketch demonstrating the shape — a real service type carrying a key, with a value genuinely
assignable to it, and the factory's own signature supplying its injection list:

```ts
export namespace ServiceManifestValidateOnStartAugmentations {
  const valKey = `@rhombus-std/options.augmentations/startup-validation-target`;

  export function validateOnStart(this: Manifest<string>, type: Type): Manifest<string> {
    return this
      // Accumulate the target in the flat startup-validation slot. This is the one slot holding the
      // composed `IOptions<T>` address rather than the bare `T` every other verb keys on, because
      // StartupValidator resolves each target and reads `.value` off it -- so the target has to be
      // resolvable.
      .add<Keyed<Type, typeof valKey>>(Type.imported('IOptions', '@rhombus-std/options', [type]))
      // One validator serves every target: its factory reads the whole target list off the resolver
      // at start time, not at registration.
      .tryAdd<IStartupValidator>(factory, typefor(factory));
  }

  function factory(resolver: IServiceProvider, startupType: Array<Keyed<Type, typeof valKey>>): IStartupValidator {
    return new StartupValidator(resolver, startupType);
  }
}
```

Three things it establishes: a fabricated global is replaceable by a real type plus a key; `Keyed<T, K>` in the
service-type position derives to the tag; and `typefor(factory)` supplies the whole injection list from the
factory's own parameters, so no hand-written `Type.func` or `RESOLVER_TYPE` is needed. The architecture for the
whole set is decided fresh when the slots above are rewritten, so this is a demonstration rather than the target.
Two things about it survive that rewrite either way:

- [ ] `Keyed` is imported as a value there; it is a type alias, so under `isolatedModules` that is a build error.
- [ ] `Type` as a `Keyed` base is unverified. `Type` is an alias to a union
      (`libraries/primitives/src/Type/Type.ts:38`), so the derivation may expand it rather than keep the name.
      Registration and injection derive from the same alias so they agree either way, but a union service type has
      its own resolution semantics.

## Inline discovery

- [ ] Issue #365 — discovery from `registerInlineBodies` marker calls instead of the JSON publish list, claim by
      owning package + member name off the checker's resolved overload, rest bodies over declared faces. Go side
      only.

- [ ] **The `*.extras` repattern, the TypeScript half of #365.** `getService` collapses to one overload set with a
      single rest body, the same shape `add` now has; and the instance entries come out of
      `di.extras/rhombus-std.json`, `di.extras.options/rhombus-std.json` and `config.extras/rhombus-std.json` once
      their markers are read.

### Back out the #365 shape in `di.extras` until the Go half lands

The target shape is already authored in two files ahead of the discovery that reads it, so nothing in either one
resolves today. Either land #365 first or restore the current shape in these places; the tree does not build
either way until one of them happens.

- [ ] **Name the sets again.** `libraries/di.extras/src/augmentations/Manifest-Descriptor-augmentations.ts:27` and
      `ServiceProvider-service-augmentations.ts:15` pass an anonymous object literal straight to
      `registerInlineBodies`. Today an entry's `impl` is a named export resolved by walking the barrel's
      re-export graph (`INLINE_IMPL_NOT_FOUND`, `transforms/internal/inlinetransform/bodyextract.go:265`), and
      `registerInlineBodies`' own docs say the set must be a top-level `const` for that reason. Restore
      `export const ManifestDescriptorAugmentations = {…}` / `ServiceProviderServiceAugmentations = {…}` —
      the shape `di.extras.options` and `config.extras` still carry.
- [ ] **Restore the named re-exports in `libraries/di.extras/src/index.ts`.** It now reads
      `import './augmentations'`, directly under the comment explaining why a side-effect import hides a set from
      `impl` resolution. The comment survived the edit; the exports did not.
- [ ] **Drop `...arguments` from the merged rest bodies.** Two independent blocks: `checkFreeIdentifiers`
      (`bodyextract.go:279`) admits only value params, type params, primitive imports and imported values — `this`
      is a keyword node and passes, `arguments` is an Identifier and trips `INLINE_BODY_FREE_IDENTIFIER`; and
      `Substitute` pairs params to args strictly positionally (`substitute.go:84`), so there is no variadic
      binding for a rest tail to collect. Until #365 brings rest bodies over declared faces, each member needs its
      own body with the face's parameters spelled out.
- [ ] **Reconcile `libraries/di.extras/rhombus-std.json` with the bodies that survive.** It still names
      `ManifestServiceAugmentations` and `ServiceProviderValueAugmentations`, both deleted, and carries entries for
      `addClass`/`addFactory`/`addValue`, `tryAddClass`/`tryAddFactory`/`tryAddValue` and
      `replaceClass`/`replaceFactory`/`replaceValue`, all merged into the flat verbs.
- [ ] **`getServices` and `getRequiredService` both delegate to `this.getService`**
      (`ServiceProvider-service-augmentations.ts:20`, `:23`).
- [ ] **`.apply(this, [...])` breaks the parity invariant.** The emit has to read
      `this.getService(Type.imported('IFoo', '@scope/pkg'))` — what a hand author writes — so the body forwards its
      arguments as a plain call, whatever the merge ends up being.

### The same conversion in `di.core`

- [ ] `libraries/di.core/src/augmentations/ServiceScopeFactory-ServiceScope-augmentations.ts` lost its namespace to
      an anonymous literal. `registerAugmentations` takes any value, so this one runs — but it leaves a dead
      `Flatten` import at `:3` and puts `this: IServiceScopeFactory` into the _face_ at `:16`, which is what the
      item below strips from `di.extras`. Restore the namespace, or keep the literal and fix both.

- [ ] **Drop the `this:` parameters from the `declare module` faces in `di.extras`.** The face is receiver-spelled
      — the interface's own generics in parameter positions, `Manifest<Scopes>` returns, no `this` parameter. As
      written, `this: Manifest` pins the receiver at `Manifest<any>` and the bare `Manifest` returns drop `Scopes`,
      which also costs scope-name checking: `scope?: string` accepts any string where `scope?: Scopes` accepts only
      the manifest's declared scopes. The namespace bodies keep their `this:` — that is where it is load-bearing.

## Comment sweep over the hand edits

The working tree carries a large by-hand change set (108 files). Comments were not moved with the code they
describe, so the sweep is over the whole diff, not the sites listed below — those are the ones already seen.

Two rules the sweep applies:

- **In an augmentation, the doc comment goes on the `declare module` face, never on the namespace or body.** The
  face is what a caller reads and what the emitted `.d.ts` carries; the implementation is not. Where both carry
  one, the body's goes. This belongs in `docs/features/augmentations.md`, which does not state it yet.
- The comment bar in `CLAUDE.md` — a comment explains the code in front of the reader, never how it got there.

Known sites:

- [ ] `libraries/hosting.core/src/IHostBuilder.ts:55` — the doc explains `TContainerBuilder`, dropped from the
      signature at `:60`. The sentence it justified ("so the delegate returns it") now points at
      `configureServices` alone.
- [ ] `libraries/hosting/src/HostBuilder.ts:62` — the implementation carries its own one-line doc duplicating the
      interface's, and is still `configureContainer<TContainerBuilder>` with the `as` cast at `:66` after the field
      at `:40` stopped being `unknown`.
- [ ] `libraries/di.core/src/augmentations/ServiceScopeFactory-ServiceScope-augmentations.ts` — the member's doc
      moved to the face correctly; the `Flatten` import at `:3` it left behind is dead.
- [ ] `libraries/di.extras/src/augmentations/` — both faces carry no docs at all. The member documentation went out
      with the namespaces when the bodies merged, and the face is where it belongs.
