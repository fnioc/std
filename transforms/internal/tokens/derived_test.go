package tokens

import (
	"path/filepath"
	"testing"

	shimast "github.com/microsoft/typescript-go/shim/ast"
)

// These tests pin DeriveTyped's aliased-union gate: a union spelled through an
// ADDRESSABLE alias (exported, or top-level in a global file) derives as the
// name it was spelled through, while a local alias — one no other module can
// spell — derives structurally, as the union itself. The checker interns a
// union per (member set, alias) pair, so the two spellings of one member set
// are distinct types and the gate reads the spelling site.

// aliasUnionFixtureSrc is a MODULE (it exports), so a non-exported top-level
// alias here is genuinely local. The Keyed brand is self-contained, matching
// the holes fixture.
const aliasUnionFixtureSrc = `declare const KEY: unique symbol;
export type Keyed<T, K extends string> = T & { readonly [KEY]?: K };

export interface IThing { readonly thing: number; }
export interface IOther { readonly other: number; }

export type ExportedUnion = IThing | IOther;
type LocalUnion = IThing | IOther;
export type ExportedMode = "a" | "b";
export type ExportedPair<A> = A | IOther;

declare const expUnion: ExportedUnion;
declare const locUnion: LocalUnion;
declare const expMode: ExportedMode;
declare const expPair: ExportedPair<IThing>;
declare const keyedUnion: Keyed<ExportedUnion, "k">;
`

// loadAliasUnions loads aliasUnionFixtureSrc with the same
// every-file-is-a-default-lib Context the holes tests use, so every named node
// derives with the bare "global" FROM and assertions pin only the gate.
func loadAliasUnions(t *testing.T) (func(name string) *Derived, func()) {
	t.Helper()
	prog, main := loadFixtureProgram(t, aliasUnionFixtureSrc, false)
	ctx := &Context{
		Checker:      prog.Checker,
		ProjectRoot:  filepath.Dir(main.FileName()),
		IsDefaultLib: func(*shimast.SourceFile) bool { return true },
	}
	derive := func(name string) *Derived {
		t.Helper()
		d, ok := DeriveTyped(ctx, ctx.Checker, typeOfDecl(t, ctx.Checker, main, name), nil)
		if !ok {
			t.Fatalf("%s did not derive", name)
		}
		return d
	}
	return derive, func() { _ = prog.Close() }
}

// requireNamedLeaf asserts d is a DerivedLeaf holding a Named node and returns it.
func requireNamedLeaf(t *testing.T, d *Derived) *TypeNode {
	t.Helper()
	if d.Kind != DerivedLeaf || d.Leaf == nil {
		t.Fatalf("expected a leaf, got %+v", d)
	}
	if d.Leaf.Kind != TypeNodeNamed {
		t.Fatalf("expected a named node, got %+v", d.Leaf)
	}
	return d.Leaf
}

func TestDeriveTypedExportedAliasUnionNames(t *testing.T) {
	derive, done := loadAliasUnions(t)
	defer done()

	node := requireNamedLeaf(t, derive("expUnion"))
	if node.Name != "ExportedUnion" || node.From != "global" || len(node.Args) != 0 {
		t.Fatalf("exported alias union derived %+v, want the bare name ExportedUnion", node)
	}
}

func TestDeriveTypedLocalAliasUnionDecomposes(t *testing.T) {
	derive, done := loadAliasUnions(t)
	defer done()

	d := derive("locUnion")
	if d.Kind != DerivedUnion {
		t.Fatalf("local alias union derived kind %v, want a structural union: %+v", d.Kind, d)
	}
	if len(d.Members) != 2 {
		t.Fatalf("expected 2 members, got %d: %+v", len(d.Members), d.Members)
	}
	names := map[string]bool{}
	for _, m := range d.Members {
		names[requireNamedLeaf(t, m).Name] = true
	}
	if !names["IThing"] || !names["IOther"] {
		t.Fatalf("expected the members IThing and IOther, got %v", names)
	}
}

func TestDeriveTypedExportedLiteralAliasUnionNames(t *testing.T) {
	derive, done := loadAliasUnions(t)
	defer done()

	node := requireNamedLeaf(t, derive("expMode"))
	if node.Name != "ExportedMode" || node.From != "global" {
		t.Fatalf("exported literal-union alias derived %+v, want the name ExportedMode", node)
	}
}

func TestDeriveTypedExportedGenericAliasUnionKeepsArgs(t *testing.T) {
	derive, done := loadAliasUnions(t)
	defer done()

	node := requireNamedLeaf(t, derive("expPair"))
	if node.Name != "ExportedPair" {
		t.Fatalf("generic alias union derived %+v, want the name ExportedPair", node)
	}
	if len(node.Args) != 1 || node.Args[0].Kind != TypeNodeNamed || node.Args[0].Name != "IThing" {
		t.Fatalf("expected the applied argument IThing, got %+v", node.Args)
	}
}

func TestDeriveTypedKeyedOverExportedAliasUnion(t *testing.T) {
	derive, done := loadAliasUnions(t)
	defer done()

	d := derive("keyedUnion")
	if d.Kind != DerivedTag || d.Tag != "k" {
		t.Fatalf("keyed alias union derived %+v, want a tag node with key \"k\"", d)
	}
	inner := requireNamedLeaf(t, d.Inner)
	if inner.Name != "ExportedUnion" {
		t.Fatalf("tag inner derived %+v, want the name ExportedUnion", inner)
	}
}

// recursiveUnionFixtureSrc pins the keyed-over-union shape: the checker
// distributes `(A | B | …) & Brand` into a union of branded members, so the
// keyed base is recovered from the alias record rather than stripped — and the
// union is SELF-REFERENTIAL, so a derivation that walked its membership
// instead of naming it would never terminate.
const recursiveUnionFixtureSrc = `declare const KEY: unique symbol;
export type Keyed<T, K extends string> = T & { readonly [KEY]?: K };

export interface ImportedType { readonly kind: "imported"; readonly name: string; readonly from: string; readonly typeArgs?: Type[]; }
export interface GlobalType { readonly kind: "global"; readonly name: string; readonly typeArgs?: Type[]; }
export interface ListType { readonly kind: "list"; readonly element: Type; }
export interface ConstructorType { readonly kind: "ctor"; readonly instance: Type; readonly args: Type[][]; }
export interface FunctionType { readonly kind: "func"; readonly returns: Type; readonly args: Type[][]; }
export interface TagType { readonly kind: "tag"; readonly type: Exclude<Type, TagType>; readonly tag: string; }
export type Type = ImportedType | GlobalType | ListType | ConstructorType | FunctionType | TagType;

declare const keyedType: Keyed<Type, "startup-validation-target">;
declare const optKeyed: Keyed<ImportedType, "k"> | undefined;

export interface IStartupValidator { validate(): void; }
export interface IResolver { get(t: Type): unknown; }
declare const factory: (resolver: IResolver, targets: Array<Keyed<Type, "startup-validation-target">>) => IStartupValidator;
`

func TestDeriveTypedKeyedOverRecursiveExportedUnion(t *testing.T) {
	prog, main := loadFixtureProgram(t, recursiveUnionFixtureSrc, false)
	defer func() { _ = prog.Close() }()
	ctx := &Context{
		Checker:      prog.Checker,
		ProjectRoot:  filepath.Dir(main.FileName()),
		IsDefaultLib: func(*shimast.SourceFile) bool { return true },
	}

	d, ok := DeriveTyped(ctx, ctx.Checker, typeOfDecl(t, ctx.Checker, main, "keyedType"), nil)
	if !ok {
		t.Fatal("keyedType did not derive")
	}
	if d.Kind != DerivedTag || d.Tag != "startup-validation-target" {
		t.Fatalf("keyed recursive union derived %+v, want a tag node", d)
	}
	inner := requireNamedLeaf(t, d.Inner)
	if inner.Name != "Type" {
		t.Fatalf("tag inner derived %+v, want the name Type", inner)
	}
}

// TestDeriveTypedKeyedElementMatchesTheKeyedRoot pins the READ side of a keyed
// slot against its WRITE side: a factory parameter typed
// `Array<Keyed<Type, K>>` re-enters derivation in a nested (type-argument)
// position, where the Keyed brand must be read BEFORE alias naming — the
// element derives as the tag over the spelled base, byte-identical to what the
// keyed type derives at the root, never as a named `Keyed` node. The two
// spellings are one address, which is what lets a reader find what a writer
// registered.
func TestDeriveTypedKeyedElementMatchesTheKeyedRoot(t *testing.T) {
	prog, main := loadFixtureProgram(t, recursiveUnionFixtureSrc, false)
	defer func() { _ = prog.Close() }()
	ctx := &Context{
		Checker:      prog.Checker,
		ProjectRoot:  filepath.Dir(main.FileName()),
		IsDefaultLib: func(*shimast.SourceFile) bool { return true },
	}

	// The write side: the keyed type derived at the root.
	written, ok := DeriveTyped(ctx, ctx.Checker, typeOfDecl(t, ctx.Checker, main, "keyedType"), nil)
	if !ok || written.Kind != DerivedTag {
		t.Fatalf("keyedType did not derive a tag: %+v", written)
	}

	// The read side: the factory's second parameter slot.
	d, ok := DeriveTyped(ctx, ctx.Checker, typeOfDecl(t, ctx.Checker, main, "factory"), nil)
	if !ok {
		t.Fatal("factory did not derive")
	}
	if d.Kind != DerivedFunc || len(d.Args) != 1 || len(d.Args[0]) != 2 {
		t.Fatalf("factory derived %+v, want one two-parameter row", d)
	}
	slot := d.Args[0][1]
	array := requireNamedLeaf(t, slot)
	if array.Name != "Array" || array.From != "global" || len(array.Args) != 1 {
		t.Fatalf("targets slot derived %+v, want Array with one element", array)
	}
	element := array.Args[0]
	if element.Kind != TypeNodeTag {
		t.Fatalf("element derived %+v, want a tag node — the Keyed alias must not be named", element)
	}
	if element.Tag != written.Tag {
		t.Fatalf("element key %q, want the written key %q", element.Tag, written.Tag)
	}
	if got, want := RenderTypeNode(element.Inner), RenderTypeNode(written.Inner.Leaf); got != want {
		t.Fatalf("element base spells %q, the written base %q — the two sides must share one address", got, want)
	}
	if got := RenderTypeNode(element); got != "Type#startup-validation-target" {
		t.Fatalf("element spells %q, want the composed keyed token", got)
	}
}

// An optional keyed slot's `| undefined` union has no single base to strip —
// the union itself derives, each member's own brand read firing, so the tag
// lands on the member and `undefined` stays a sibling.
func TestDeriveTypedOptionalKeyedDerivesMemberwise(t *testing.T) {
	prog, main := loadFixtureProgram(t, recursiveUnionFixtureSrc, false)
	defer func() { _ = prog.Close() }()
	ctx := &Context{
		Checker:      prog.Checker,
		ProjectRoot:  filepath.Dir(main.FileName()),
		IsDefaultLib: func(*shimast.SourceFile) bool { return true },
	}

	d, ok := DeriveTyped(ctx, ctx.Checker, typeOfDecl(t, ctx.Checker, main, "optKeyed"), nil)
	if !ok {
		t.Fatal("optKeyed did not derive")
	}
	if d.Kind != DerivedUnion || len(d.Members) != 2 {
		t.Fatalf("optional keyed derived %+v, want a two-member union", d)
	}
	tagged := d.Members[0]
	if tagged.Kind != DerivedTag || tagged.Tag != "k" {
		t.Fatalf("first member derived %+v, want a tag node with key \"k\"", tagged)
	}
	if inner := requireNamedLeaf(t, tagged.Inner); inner.Name != "ImportedType" {
		t.Fatalf("tag inner derived %+v, want the name ImportedType", inner)
	}
	if d.Members[1].Kind != DerivedUndefined {
		t.Fatalf("second member derived %+v, want the undefined singleton", d.Members[1])
	}
}

// An alias exported through an export list — `type U = …; export { U }`, the
// shape a rolled declaration bundle spells — is as addressable as one carrying
// the modifier, so it names its union too.
func TestDeriveTypedExportListAliasUnionNames(t *testing.T) {
	src := `interface IThing { readonly thing: number; }
interface IOther { readonly other: number; }
type ListedUnion = IThing | IOther;
export { ListedUnion };
declare const lu: ListedUnion;
export const anchor = 1;
`
	prog, main := loadFixtureProgram(t, src, false)
	defer func() { _ = prog.Close() }()
	ctx := &Context{
		Checker:      prog.Checker,
		ProjectRoot:  filepath.Dir(main.FileName()),
		IsDefaultLib: func(*shimast.SourceFile) bool { return true },
	}

	d, ok := DeriveTyped(ctx, ctx.Checker, typeOfDecl(t, ctx.Checker, main, "lu"), nil)
	if !ok {
		t.Fatal("lu did not derive")
	}
	node := requireNamedLeaf(t, d)
	if node.Name != "ListedUnion" {
		t.Fatalf("export-list alias union derived %+v, want the name ListedUnion", node)
	}
}

// A global (non-module) file's top-level alias is ambient — spellable from
// anywhere with no import — so it names its union without an export modifier.
func TestDeriveTypedGlobalScriptAliasUnionNames(t *testing.T) {
	src := `interface IThing { readonly thing: number; }
interface IOther { readonly other: number; }
type AmbientUnion = IThing | IOther;
declare const au: AmbientUnion;
`
	prog, main := loadFixtureProgram(t, src, false)
	defer func() { _ = prog.Close() }()
	ctx := &Context{
		Checker:      prog.Checker,
		ProjectRoot:  filepath.Dir(main.FileName()),
		IsDefaultLib: func(*shimast.SourceFile) bool { return true },
	}

	d, ok := DeriveTyped(ctx, ctx.Checker, typeOfDecl(t, ctx.Checker, main, "au"), nil)
	if !ok {
		t.Fatal("au did not derive")
	}
	node := requireNamedLeaf(t, d)
	if node.Name != "AmbientUnion" || node.From != "global" {
		t.Fatalf("ambient alias union derived %+v, want the name AmbientUnion", node)
	}
}
