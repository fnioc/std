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
	prog, ctx, main := loadGenerics(t)
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

// TestDeriveTypeFNestedGenericShape pins the actual TREE shape for a nested hole
// inside a closed generic — not just its rendered string — so a change that
// happens to render the same string but restructures the tree (e.g. flattening
// the hole into the base name) is still caught.
func TestDeriveTypeFNestedGenericShape(t *testing.T) {
	prog, ctx, main := loadGenerics(t)
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
	prog, ctx, main := loadGenerics(t)
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

// TestDeriveTypeFTupleShape pins the tree shape of a tuple: a TypeNodeTuple
// whose Members are the slot types in declaration order, one node per slot,
// each derived by the same walk that derives any other node — so a nested
// tuple, a hole and a keyed literal union all reach their own kinds.
func TestDeriveTypeFTupleShape(t *testing.T) {
	prog, ctx, main := loadGenerics(t)
	defer func() { _ = prog.Close() }()

	cases := map[string]string{
		"tuple":         "[IOther,ICache]",
		"tupleNested":   "[IOther,[ICache,IOther]]",
		"tupleHole":     "[IOther,$1]",
		"tupleKeyed":    `[ICache#redis,"a" | "b"]`,
		"tupleEmpty":    "[]",
		"tupleReadonly": "[IOther,ICache]",
		"tupleLabeled":  "[IOther,ICache]",
	}
	for name, want := range cases {
		t.Run(name, func(t *testing.T) {
			node, ok := DeriveTypeF(ctx, typeOfDecl(t, ctx.Checker, main, name), nil)
			if !ok {
				t.Fatalf("%s did not derive a TypeNode", name)
			}
			if node.Kind != TypeNodeTuple {
				t.Fatalf("expected a tuple node, got kind %v", node.Kind)
			}
			if got := renderTypeNode(node); got != want {
				t.Fatalf("rendered tuple = %q, want %q", got, want)
			}
		})
	}

	node, ok := DeriveTypeF(ctx, typeOfDecl(t, ctx.Checker, main, "tupleNested"), nil)
	if !ok {
		t.Fatal("tupleNested did not derive a TypeNode")
	}
	if len(node.Members) != 2 {
		t.Fatalf("expected 2 slots, got %d: %+v", len(node.Members), node.Members)
	}
	if node.Members[0].Kind != TypeNodeNamed || node.Members[0].Name != "IOther" {
		t.Fatalf("expected a named first slot, got %+v", node.Members[0])
	}
	inner := node.Members[1]
	if inner.Kind != TypeNodeTuple || len(inner.Members) != 2 {
		t.Fatalf("expected a 2-slot tuple second slot, got %+v", inner)
	}
	if inner.Members[1].Kind != TypeNodeNamed || inner.Members[1].Name != "IOther" {
		t.Fatalf("expected IOther in the inner tuple's last slot, got %+v", inner.Members[1])
	}
}

// TestDeriveTypeFTupleSlotOrderIsIdentity pins that the slots are NOT sorted
// the way a union's members are at render time: two tuples over the same types
// in different orders are two types and must render as two tokens.
func TestDeriveTypeFTupleSlotOrderIsIdentity(t *testing.T) {
	other := &TypeNode{Kind: TypeNodeNamed, Name: "IOther", From: "global"}
	cache := &TypeNode{Kind: TypeNodeNamed, Name: "ICache", From: "global"}

	forward := renderTypeNode(&TypeNode{Kind: TypeNodeTuple, Members: []*TypeNode{other, cache}})
	reversed := renderTypeNode(&TypeNode{Kind: TypeNodeTuple, Members: []*TypeNode{cache, other}})
	if forward == reversed {
		t.Fatalf("both orderings rendered %q", forward)
	}
}

// TestDeriveTypeFVariableLengthTupleIsUnderivable pins the refusal: an
// optional or rest slot leaves the tuple's length open, and a list of slots
// can only state a fixed one, so derivation fails rather than reporting an
// arity the type does not have.
func TestDeriveTypeFVariableLengthTupleIsUnderivable(t *testing.T) {
	prog, ctx, main := loadGenerics(t)
	defer func() { _ = prog.Close() }()

	for _, name := range []string{"tupleOptional", "tupleRest"} {
		t.Run(name, func(t *testing.T) {
			node, ok := DeriveTypeF(ctx, typeOfDecl(t, ctx.Checker, main, name), nil)
			if ok {
				t.Fatalf("%s derived %s, want a refusal", name, renderTypeNode(node))
			}
		})
	}
}

// TestDeriveTypeFAliasedTupleDerivesByName pins that a tuple spelled through a
// type alias derives as the NAME it was spelled through, like an aliased
// union: its address must not shift with the element list.
func TestDeriveTypeFAliasedTupleDerivesByName(t *testing.T) {
	prog, ctx, main := loadGenerics(t)
	defer func() { _ = prog.Close() }()

	node, ok := DeriveTypeF(ctx, typeOfDecl(t, ctx.Checker, main, "tupleAliased"), nil)
	if !ok {
		t.Fatal("tupleAliased did not derive a TypeNode")
	}
	if node.Kind != TypeNodeNamed || node.Name != "Pair" {
		t.Fatalf("expected the Pair name, got %+v", node)
	}
}

// TestDeriveTypeFParameterListUtilitiesAreTuples pins that the checker hands
// ConstructorParameters<> and Parameters<> back already resolved to concrete
// tuples, so they derive through the tuple walk with no case of their own.
func TestDeriveTypeFParameterListUtilitiesAreTuples(t *testing.T) {
	prog, ctx, main := loadGenerics(t)
	defer func() { _ = prog.Close() }()

	for _, name := range []string{"tupleCtorParams", "tupleFnParams"} {
		t.Run(name, func(t *testing.T) {
			node, ok := DeriveTypeF(ctx, typeOfDecl(t, ctx.Checker, main, name), nil)
			if !ok {
				t.Fatalf("%s did not derive a TypeNode", name)
			}
			if node.Kind != TypeNodeTuple {
				t.Fatalf("expected a tuple node, got kind %v", node.Kind)
			}
			if got := renderTypeNode(node); got != "[IOther,ICache]" {
				t.Fatalf("rendered %q, want %q", got, "[IOther,ICache]")
			}
		})
	}
}
