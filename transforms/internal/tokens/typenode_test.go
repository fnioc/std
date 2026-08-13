package tokens

import (
	"testing"
)

// These tests pin the renderer-over-structure equivalence the DeriveTokenF /
// DeriveTypeF split relies on: DeriveTokenF is now literally
// renderTypeNode(DeriveTypeF(...)), so proving the two agree here is a
// regression guard against a future change that decouples them again, not proof
// of independent behavior.

func TestDeriveTokenFMatchesRendererOverDeriveTypeF(t *testing.T) {
	prog, ctx, main := loadHoles(t)
	defer func() { _ = prog.Close() }()

	names := []string{
		"litStr", "intr", "holeInThing", "plain", "anon", "nestedAnon",
		"hole3", "puA", "puNonLit", "puNonUnion", "sWideBool", "sUnion",
	}
	for _, name := range names {
		t.Run(name, func(t *testing.T) {
			decl := typeOfDecl(t, ctx.Checker, main, name)

			wantStr, wantOk := DeriveTokenF(ctx, decl, nil)

			node, gotOk := DeriveTypeF(ctx, decl, nil)
			var gotStr string
			if gotOk {
				gotStr = renderTypeNode(node)
			}

			if gotOk != wantOk || gotStr != wantStr {
				t.Fatalf("DeriveTypeF+render = (%q, %v), want DeriveTokenF = (%q, %v)", gotStr, gotOk, wantStr, wantOk)
			}
		})
	}
}

// TestDeriveTypeFHoleInGenericShape pins the actual TREE shape for a nested hole
// inside a closed generic — not just its rendered string — so a change that
// happens to render the same string but restructures the tree (e.g. flattening
// the hole into the base name) is still caught.
func TestDeriveTypeFHoleInGenericShape(t *testing.T) {
	prog, ctx, main := loadHoles(t)
	defer func() { _ = prog.Close() }()

	node, ok := DeriveTypeF(ctx, typeOfDecl(t, ctx.Checker, main, "holeInThing"), nil)
	if !ok {
		t.Fatal("holeInThing did not derive a TypeNode")
	}
	if node.Kind != TypeNodeNamed || node.Name != "IThing" || node.From != "global" {
		t.Fatalf("unexpected named node: %+v", node)
	}
	if len(node.Args) != 1 {
		t.Fatalf("expected exactly one generic arg, got %d", len(node.Args))
	}
	arg := node.Args[0]
	if arg.Kind != TypeNodePlaceholder || arg.Label != "1" {
		t.Fatalf("expected a $1 placeholder arg, got %+v", arg)
	}
}

// TestDeriveTypeFLiteralUnionShape pins the tree shape of a pure-literal union:
// a TypeNodeUnion of TypeNodeLiteral members, one per union member, in checker
// order (unsorted — the sort is a rendering concern).
func TestDeriveTypeFLiteralUnionShape(t *testing.T) {
	prog, ctx, main := loadHoles(t)
	defer func() { _ = prog.Close() }()

	node, ok := DeriveTypeF(ctx, typeOfDecl(t, ctx.Checker, main, "puA"), nil)
	if !ok {
		t.Fatal("puA did not derive a TypeNode")
	}
	if node.Kind != TypeNodeUnion {
		t.Fatalf("expected a union node, got kind %v", node.Kind)
	}
	if len(node.Members) != 2 {
		t.Fatalf("expected 2 members, got %d: %+v", len(node.Members), node.Members)
	}
	for _, m := range node.Members {
		if m.Kind != TypeNodeLiteral || m.Literal.Kind != LiteralString {
			t.Fatalf("expected a string literal member, got %+v", m)
		}
	}
	rendered := renderTypeNode(node)
	if rendered != `"a" | "b"` {
		t.Fatalf("rendered union = %q, want %q", rendered, `"a" | "b"`)
	}
}
