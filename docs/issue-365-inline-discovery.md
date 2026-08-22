# Issue #365 — inline discovery from `registerInlineBodies` (in-repo spec mirror)

> Transient working doc for the agent executing docs/rewrite-plan.md — delete it alongside
> that file at wrap-up. Mirrors GitHub issue #365; the SPEC REVISIONS section below was posted
> after the body and SUPERSEDES it wherever they differ.

## Spec revisions (authoritative where they differ from the body)

Spec revisions, superseding the body text where they differ:

1. **The JSON list stays.** Marker-call discovery is an additional channel, not a replacement — not every inlinable is an augmentation, so `rhombus-std.json` remains the mechanism for the rest. The overload hole closes for marker-discovered entries; JSON entries keep their existing semantics.
2. **Registrations accumulate in any partition.** One `registerInlineBodies` call may carry one overload's body, several, or all of them, and further calls may add more. The unit is the (member, overload signature) pair regardless of which call supplied it.
3. **Rest bodies are permitted, never required.** A rest-parameter body is one authoring choice for one registration; per-overload bodies with their own signatures are equally first-class. The body's 'rest bodies over declared faces' framing describes an option, not the model.
4. **Selection is the checker's resolution, full stop.** The engine performs no overload resolution of its own: the signature the checker resolved the call to — the same one intellisense displays as selected — is the selection, and the engine inlines the body registered for exactly that signature. A resolved face with no registered body is a loud build error, never a nearest-match substitution. What the author saw is what gets inlined.

---

## Original issue body

# Inline discovery from `registerInlineBodies`, and rest bodies over declared faces

## Context

The `inline` publish list in each `*.extras` package's `rhombus-std.json` names a member by
`{type, impl, member}` — an interface and a member name, with no way to say _which overload_. The Go
stage papers over that with a `Discriminator` built from the type-parameter count plus the
value-parameter **names** in order (`bodyextract.go:57`, which states outright that parameter types
are never read). Nothing makes those names differ between a sugar overload and the primitive it
sugars; today they happen to, and that is the whole of the safety margin. Rename a parameter and a
consumer's `manifest.add(descriptor)` silently starts substituting a sugar body.

The receiver-side reorganization in the working tree removes the last reason to keep the JSON. Every
inlinable instance member now follows the augmentation pattern: a `declare module` face beside an
`export namespace` of bodies, with `registerInlineBodies<Receiver>(TheNamespace)` at module level
next to it. That call carries everything an entry did — the receiver as its type argument, the body
set as its argument, the members as the set's own exports — so entries are _discovered_, not
_declared_.

Two things follow, and together they close the overload hole:

- **Discovery moves to the marker call.** No JSON entry means no chance for one to under-specify.
- **The call site is claimed by whatever TypeScript itself resolved.** The stage already asks the
  checker (`GetResolvedSignature` → declaration node, `matcher.go:173`); the missing piece is
  deciding whether that declaration is one of the publisher's. Owning package + member name answers
  it exactly, because a `*.extras` package declares nothing onto a receiver that is not sugar.

Argument-shape matching is _not_ the criterion and must not be: one sugar face is
`add<T>(this: Manifest, value: T)`, whose parameters accept any single argument — including the
`ServiceDescriptor` the primitive `add` takes. Assignability says yes there; overload resolution
says no. Only the checker's own pick is correct.

### One body per member, covering every face

An author should not have to restate the overload set inside the namespace. One rest body claims
**every face of that name the publisher declares**:

```ts
declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string> {
    add<T>(this: Manifest, configure: Func<[ServiceDescriptorBuilderFor<T, string>], IComplete>): Manifest;
    add<T>(this: Manifest, ctor: Ctor<any[], T>, ctorType: ConstructorType, scope?: string): Manifest;
    add<T>(this: Manifest, factory: Func<any[], T>, factoryType: FunctionType, scope?: string): Manifest;
    add<T>(this: Manifest, value: T): Manifest;
    removeAll<T>(this: Manifest): Manifest;
  }
}

export namespace ManifestDescriptorAugmentations {
  export function add<T>(this: Manifest, ...args: any[]): Manifest {
    return this.add.apply(this, [typefor<T>(), ...args] as any);
  }
  export function removeAll<T>(this: Manifest): Manifest {
    return this.removeAll(typefor<T>());
  }
}
registerInlineBodies<Manifest>(ManifestDescriptorAugmentations);
```

This retires the engine's present assumption, stated verbatim in the diagnostic it currently raises
(`bodyextract.go:189`): _"the implementation is the declared face, so every parameter it takes must
be named."_ Binding stays what it is today — **positional against the impl's own parameter list** —
and gains exactly two things: a trailing rest absorbs the remaining arguments as a group, and
`arguments` names the whole set blind. The impl signature is taken as correct; nothing is validated
against the face's arity.

Parameters keep their full generality, so a body may reorder, drop, or repeat them:

```ts
// impl:  asdf(a, b, ...c) { this.qwer(b, ...c, a) }
asdf(q, w, e, d, f); // a=q, b=w, c=[e,d,f]
qwer(w, e, d, f, q); // emitted
```

**`arguments` is a blind replacement for the whole argument set**, in call-site order, independent
of whatever the impl declares — so a body can reach every argument without naming a rest parameter,
or without declaring parameters at all:

```ts
export function tryAdd<T>(this: Manifest): Manifest {
  return this.tryAdd.apply(this, [typefor<T>(), ...arguments] as any);
}
manifest.tryAdd<IGreeter>(Greeter, ctorType);
// emits
manifest.tryAdd(__typefor_IGreeter, Greeter, ctorType);
```

A spread of a declared trailing rest and a spread of `arguments` are both supported, and where a
body could be written either way the two emit identically.

For the descriptor verbs that means:

```ts
manifest.add<IGreeter>(Greeter, ctorType, 'scoped');
// emits
manifest.add(__typefor_IGreeter, Greeter, ctorType, 'scoped');
```

A zero-argument call splices an empty group and needs no special case —
`manifest.removeAll<IGreeter>()` emits `manifest.removeAll(__typefor_IGreeter)` whether the body
takes a rest or not.

**Scope: the Go mechanism only.** The `*.extras` TypeScript repattern — the `di.extras` barrel, the
`getService` sets collapsing, `registerInlineBodies` calls replacing `registerAugmentations` on
those sets, deleting the dead instance entries from the JSON — is the owner's. The full gate cannot
go green until both halves land; the Go work is verified on its own tests until then.

**The JSON system stays.** Nothing about `inline.entries` is removed — not the schema, not the
reader (`ResolveConfig`/`entriesFromResolved`), not the `extends` chain, and not any of the four
entry shapes. Marker discovery is an _additional_ source of the same `Entry` values, so a package
may publish by JSON, by marker, or by both. `primitives.extras` keeps publishing
`registerAugmentations` as a floater entry (`impl` only, no receiver, its own source is the body) —
a shape `registerInlineBodies<R>()` cannot express, and the reason the JSON path has to stay live
regardless. What changes in-repo is only which packages _use_ it: the instance entries in
`di.extras`, `di.extras.options` and `config.extras` become redundant once their markers are read,
and the owner deletes them as part of the TypeScript half.

## Changes — all under `transforms/internal/inlinetransform/`

### 1. Marker discovery (new — `sideparse.go`, `collector.go`)

Add a syntax-only scan yielding the same `Entry` values `entriesFromResolved` (`entries.go:333`)
produces, so everything downstream is untouched.

For each package reached by `CollectProject` (`collector.go:47`), enumerate its reachable source
files by reusing the BFS already written for `impl` resolution: `resolveEntryFile`
(`bodyextract.go:738`) for the entry point, `reExportTargets` (`bodyextract.go:699`) and
`resolveRelativeModule` (`bodyextract.go:719`) for the barrel graph. In each file, find every call
to `registerInlineBodies` imported from `@rhombus-std/primitives.extras` — the specifier is already
known to the parser as `knownAuthoringMarkers` (`bodyextract.go:54`), where it exists only to
_exclude_ the marker from `valueImports`. It becomes a discovery key.

From each call, synthesize one `Entry` per exported member of the set:

- `type` — the sole type argument, stripped of its own type arguments (`registerInlineBodies<Manifest<any>>`
  in `di.extras.options` must yield `Manifest`), resolved through the file's imports to a
  `<package>:<Name>` ref via `ParseTypeRef` (`typeref.go:37`). A type argument that is not an
  imported name is a diagnostic, not a silent skip.
- `impl` — the owning package's name plus the set identifier, the `<package>:<Name>` shape
  `locateImpl` (`bodyextract.go:220`) already consumes.
- `member` — each exported function of the referenced `export namespace`, or each property of the
  referenced object-literal `const` (`config.extras` and `di.extras.options` use the const form).

Merge discovered entries with the JSON ones into `ProjectScan.Bodies`, deduplicating on
`(type, impl, member)` so a package that still lists an instance entry in its JSON while also
calling the marker yields one entry, not two. That tolerance is what lets this land ahead of the
TypeScript cleanup.

### 2. Claim by owning package, not by parameter names (`resolve.go`, `matcher.go`)

`resolveMember` (`resolve.go:81`) currently keys candidate declarations on the receiver by
`Discriminator.Matches` (`bodyextract.go:488`). For instance-member entries, replace that with:

> a declaration claims the body iff the member name matches **and** the declaration's source file
> belongs to the entry's `impl` package.

Every publisher-owned face of that name binds to the one body — that is what makes the rest form
work. Owner resolution walks from the declaration's source file to the nearest enclosing
`package.json`, then reads its `name`; both halves exist already, as the ancestor walk at
`collector.go:110`/`:195` and `packageName` at `collector.go:279`. It must work against the rolled
`dist/bundle/*.d.ts` a consumer actually resolves through, which is why the check is package-level
rather than file-level.

`Discriminator` and `valueParamsAndDiscriminator` (`bodyextract.go:424`) stay for floater resolution
(`resolve.go:180`) and `anyDeclarationTakes` (`resolve.go:165`); they leave the instance-member path.

The first-claim-wins collision policy at `stage.go:69-73` becomes unreachable for instance members —
two entries can only collide if one package publishes two same-named bodies for one receiver. Make
that a diagnostic rather than a silent ordering rule.

### 3. Rest bodies (`bodyextract.go`, `substitute.go`, `sweep.go`)

Remove the `INLINE_REST_BODY` rejection at `bodyextract.go:189`. Arity facts stay derived from the
impl signature, which `valueParamsAndDiscriminator` (`bodyextract.go:424`) already encodes rest
parameters into: a trailing rest makes the `MaxValueArgCount` that `sugarShapeMatches`
(`sweep.go:117`) tests unbounded, while `requiredParamCount` still counts the leading named
parameters. Nothing is read off the face for arity.

Substitution binds parameters positionally into a `params map[string]*shimast.Node` and rewrites
identifiers through the single return expression (`substitute.go:151`, `:247`). Two additions:

- a **group binding** — the trailing rest holds the arguments past the named ones, spliced wherever
  it is spread; `visitArguments` (`substitute.go:193`) is already the seam that rewrites an argument
  list, so splicing a group into it is local;
- **`arguments`** — a blind stand-in for the whole argument set, in order, needing no declared
  parameter at all.

Both spread spellings are supported and emit identically. Leading named parameters keep binding as
they do now, so `this.qwer(b, ...c, a)` reorders and interleaves without special handling.

Support **both** call forms:

```ts
// spread call — splice only
return (this.add as any)(typefor<T>(), ...args);

// .apply — splice plus call-form normalization
return this.add.apply(this, [typefor<T>(), ...arguments] as any);
```

The `.apply` form needs `x.m.apply(this, [ … ])` recognized as a call form and rewritten to a direct
call: collapse the array literal, flatten the splice into the argument list, and write the receiver
**once**. Receiver duplication is already a known hazard with machinery in place — `countThis`
(`substitute.go:309`), `establishesThis` (`:331`), `isSimpleReceiver` (`:349`) — and reusing it is
what keeps byte-parity, since the naive emit
`manifest.add.apply(manifest, [__typefor_IFoo, ...[Greeter, ctorType]])` is not what a hand author
writes.

### 4. Face/body name diff (`resolve.go`)

The names on the two halves must correspond. Matching already enumerates the receiver's declarations
owned by the `impl` package and discovery already has the set's member names, so diff them and
diagnose both directions:

- a publisher-owned face with no same-named body — the call typechecks, nothing claims it, and
  because these sets are `registerInlineBodies` rather than `registerAugmentations` nothing is on
  the prototype either, so it dies at runtime with `… is not a function`;
- a body no publisher-owned face declares — unreachable, since no consumer can name it.

This is the only place reading the `declare module` block earns its keep; elsewhere the stage reads
a resolved declaration for its name and owning package alone.

### 5. Docs

`docs/features/transformer-architecture.md` describes the JSON publish list as the sole discovery
mechanism and a named-parameter implementation as the required body shape. Rewrite both sections
around the two discovery sources — the marker call for instance members, the JSON for every shape
including the floaters only it can express — and around the rest/`arguments` body forms. First-pass
voice: described as if it had always been this way, not narrated as a migration.

## Verification

Go gates, from `transforms/` after `node scripts/gen-go-work.mjs` (needs mise Go on PATH; `mise
trust` first in a fresh worktree):

```
go build ./... && go vet ./... && go test ./... && gofmt -l .
```

New and updated Go tests, all in `internal/inlinetransform/`:

- `sideparse_test.go` — marker discovery: namespace form, object-literal-`const` form, a type
  argument carrying its own type arguments, a non-imported type argument (diagnostic), a set
  identifier resolving to nothing (diagnostic).
- `collector_test.go` — a fixture whose entries come only from markers; a fixture carrying both a
  JSON instance entry and the equivalent marker, asserting one deduplicated entry.
- `resolve_test.go` / `declaredface_test.go` — the load-bearing case: a receiver carrying a
  primitive `add(descriptor)` from package A and a sugar `add` overload set from package B, with
  only B's declarations claiming B's body. Plus the name-diff diagnostics in both directions.
- `substitute_test.go` — splice emission for both call forms and both splice tokens; a zero-argument
  call site splicing empty; the reorder case (`asdf(a, b, ...c)` → `this.qwer(b, ...c, a)`); a
  receiver written once in the `.apply` form.
- `stage_test.go` / `sweep_test.go` — a trailing rest making the accepted argument count unbounded
  while the leading named parameters stay required.
- `specificity_test.go` — existing expectations re-derived against ownership rather than parameter
  names.

End-to-end parity (`tests/*.ttsc.e2e`, `bun run test`) stays red until the `*.extras` repattern
lands — `di.extras`'s barrel still re-exports a deleted module. Once both halves are in, the check
that matters is the app example byte-diff: `examples.app.with-transformer`'s emitted output must
equal `examples.app.without-transformer`'s `expected.txt`, which is what proves a sugar call site
and a hand-written primitive call site produce the same bytes.
