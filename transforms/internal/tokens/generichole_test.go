package tokens

import (
	"path/filepath"
	"testing"

	shimast "github.com/microsoft/typescript-go/shim/ast"
)

// These tests pin how DeriveTyped classifies an OPEN type — one carrying the
// `Generic<L, C>` / `$<L>` hole brand. A hole, and any template applied with
// one, derives by the node it is spelled as, ahead of the callable/union
// classification: a constrained hole is still a hole even though its constraint
// bears signatures, and an open template is its named address even though the
// template itself is callable. A hole sitting in a signature SLOT is the other
// reading and keeps the callable classification.

// genericHoleFixtureSrc mirrors the shapes an open registration is authored
// with: the brand pair, a callable template (a scope factory), a plain
// template, and a class whose constructor takes a hole.
const genericHoleFixtureSrc = `declare const HOLE: unique symbol;
type Generic<L extends string, C = unknown> = C & { readonly [HOLE]?: L };
type $<L extends string> = Generic<L>;

type Ctor<A extends any[] = any[], R = any> = abstract new (...args: A) => R;
type Func<A extends any[] = any[], R = any> = (...args: A) => R;

interface IProvider { readonly provider: number; }
interface IThing<T = unknown> { readonly thing: T; }
interface Opener<Lifetime> { (lifetime: Lifetime): IProvider; }

declare class Widget { constructor(dep: $<"1">); }

declare const bareHole: $<"X">;
declare const constrainedHole: Generic<"C", Ctor | Func>;
declare const openThing: IThing<$<"X">>;
declare const openOpener: Opener<$<"T">>;
declare const closedOpener: Opener<IProvider>;
declare const widgetCtor: typeof Widget;
`

// loadGenericHoles loads genericHoleFixtureSrc with the same
// every-file-is-a-default-lib Context the other derivation tests use, so every
// named node derives with the bare "global" FROM and the assertions pin only
// the hole grammar.
func loadGenericHoles(t *testing.T) (func(name string) *Derived, func()) {
	t.Helper()
	prog, main := loadFixtureProgram(t, genericHoleFixtureSrc, false)
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

// requirePlaceholderLeaf asserts d is a DerivedLeaf holding a hole node with the
// expected label.
func requirePlaceholderLeaf(t *testing.T, d *Derived, label string) {
	t.Helper()
	if d.Kind != DerivedLeaf || d.Leaf == nil {
		t.Fatalf("expected a leaf, got %+v", d)
	}
	if d.Leaf.Kind != TypeNodePlaceholder || d.Leaf.Label != label {
		t.Fatalf("expected the hole %q, got %+v", label, d.Leaf)
	}
}

func TestDeriveTypedBareHole(t *testing.T) {
	derive, done := loadGenericHoles(t)
	defer done()

	requirePlaceholderLeaf(t, derive("bareHole"), "X")
}

func TestDeriveTypedConstrainedHoleIgnoresItsConstraint(t *testing.T) {
	derive, done := loadGenericHoles(t)
	defer done()

	requirePlaceholderLeaf(t, derive("constrainedHole"), "C")
}

func TestDeriveTypedOpenTemplateNamesItsArgument(t *testing.T) {
	derive, done := loadGenericHoles(t)
	defer done()

	for _, tc := range []struct{ decl, name, label string }{
		{"openThing", "IThing", "X"},
		{"openOpener", "Opener", "T"},
	} {
		t.Run(tc.decl, func(t *testing.T) {
			node := requireNamedLeaf(t, derive(tc.decl))
			if node.Name != tc.name || node.From != "global" {
				t.Fatalf("open template derived %+v, want the bare name %s", node, tc.name)
			}
			if len(node.Args) != 1 {
				t.Fatalf("expected exactly one generic arg, got %d: %+v", len(node.Args), node.Args)
			}
			arg := node.Args[0]
			if arg.Kind != TypeNodePlaceholder || arg.Label != tc.label {
				t.Fatalf("expected the hole %q as the argument, got %+v", tc.label, arg)
			}
		})
	}
}

func TestDeriveTypedClosedCallableTemplateStaysAFunction(t *testing.T) {
	derive, done := loadGenericHoles(t)
	defer done()

	d := derive("closedOpener")
	if d.Kind != DerivedFunc {
		t.Fatalf("closed callable template derived kind %v, want a function: %+v", d.Kind, d)
	}
}

func TestDeriveTypedHoleInASignatureSlotKeepsTheCallable(t *testing.T) {
	derive, done := loadGenericHoles(t)
	defer done()

	d := derive("widgetCtor")
	if d.Kind != DerivedCtor {
		t.Fatalf("open constructor derived kind %v, want a constructor: %+v", d.Kind, d)
	}
	if len(d.Args) != 1 || len(d.Args[0]) != 1 {
		t.Fatalf("expected one signature of one parameter, got %+v", d.Args)
	}
	requirePlaceholderLeaf(t, d.Args[0][0], "1")
}
