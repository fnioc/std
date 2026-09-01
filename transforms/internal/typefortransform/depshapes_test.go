package typefortransform

import (
	"strings"
	"testing"
)

// TestTypeforValueArgComplexDepShapes drives the value-argument derivation
// through the constructor-parameter shapes the simpler ctor cases in
// typefor_test.go do not reach: an inline function-type param, an optional
// param, an inline union param, an inline arrow VALUE, and a declaration-less
// ctor VALUE. Every shape derives cleanly (no diagnostic) — the same
// tokens.DeriveNode narrowing every other typefor derivation shares.
//
// A REST parameter (`...deps: [A, B]`) is NOT among these shapes — see
// TestTypeforValueArgRestParameterIsAKnownGap below.
func TestTypeforValueArgComplexDepShapes(t *testing.T) {
	src := `import { typefor } from '@rhombus-std/primitives.extras';
interface IDep {}
interface IOther {}
interface IThing {}
class FnParam { constructor(make: (d: IDep) => IThing) { void make; } }
class OptParam { constructor(dep?: IDep) { void dep; } }
class UnionParam { constructor(dep: IDep | IOther) { void dep; } }
declare const Ctor: new (d: IDep) => IThing;
export const fnParam = typefor(FnParam);
export const optParam = typefor(OptParam);
export const unionParam = typefor(UnionParam);
export const arrowValue = typefor((x: IDep) => ({} as IThing));
export const ctorValue = typefor(Ctor);
`
	prog, app := buildTypeforWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	out, diags := lowerTypeforDiags(t, prog, app)
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	if strings.Contains(out, "typefor(") {
		t.Errorf("a typefor() call survived lowering:\n%s", out)
	}

	cases := map[string]string{
		// Inline function-type param → a nested Type.func(...) node, resolved at
		// runtime as a late-bound callable — no special "factory slot" form needed.
		"fnParam": `Type.ctor(Type.imported("FnParam", "@scope/app/main"), ` +
			`[[Type.func(Type.imported("IThing", "@scope/app/main"), [[Type.imported("IDep", "@scope/app/main")]])]])`,
		// Optional param → its type unioned with the nullish singleton, non-nullish first.
		"optParam": `Type.ctor(Type.imported("OptParam", "@scope/app/main"), ` +
			`[[Type.union(Type.imported("IDep", "@scope/app/main"), Type.typeLiteral(undefined))]])`,
		// Inline union param → Type.union(...) over both members.
		"unionParam": `Type.ctor(Type.imported("UnionParam", "@scope/app/main"), ` +
			`[[Type.union(Type.imported("IDep", "@scope/app/main"), Type.imported("IOther", "@scope/app/main"))]])`,
		// Inline arrow value → its own call signature.
		"arrowValue": `Type.func(Type.imported("IThing", "@scope/app/main"), [[Type.imported("IDep", "@scope/app/main")]])`,
		// Declaration-less ctor reference → its construct signature.
		"ctorValue": `Type.ctor(Type.imported("IThing", "@scope/app/main"), [[Type.imported("IDep", "@scope/app/main")]])`,
	}
	for name, want := range cases {
		if got := exprFor(t, out, name); got != want {
			t.Errorf("%s: got %q, want %q\nfull output:\n%s", name, got, want, out)
		}
	}
}

// TestTypeforValueArgRestParameterIsAKnownGap pins a deliberate scope
// limitation: a REST parameter occupies a single slot whose type is the
// parameter's own tuple type, while the call it answers to takes one argument
// per tuple slot — expanding a rest parameter back into slots of its own is a
// derivation tokens.DeriveNode does not do, so it reports
// valueArgUnderivableCode rather than misstating the signature's arity as one.
func TestTypeforValueArgRestParameterIsAKnownGap(t *testing.T) {
	src := `import { typefor } from '@rhombus-std/primitives.extras';
interface IDep {}
interface IOther {}
class TupleRest { constructor(...deps: [IDep, IOther]) { void deps; } }
export const tupleRest = typefor(TupleRest);
`
	prog, app := buildTypeforWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	out, diags := lowerTypeforDiags(t, prog, app)
	if !strings.Contains(out, "typefor(TupleRest)") {
		t.Errorf("a rest-parameter constructor must leave the call un-lowered:\n%s", out)
	}
	if len(diags) != 1 || diags[0].Code != valueArgUnderivableCode {
		t.Fatalf("expected one %s diagnostic, got %+v", valueArgUnderivableCode, diags)
	}
}
