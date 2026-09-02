package typefortransform

import (
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
// TestTypeforValueArgTupleRestParameterExpandsIntoSlots pins the tuple-typed
// rest shape: `(...deps: [IDep, IOther])` answers to exactly one IDep and one
// IOther, so the rest parameter's tuple splices into the signature as if its
// slots were written as parameters.
func TestTypeforValueArgTupleRestParameterExpandsIntoSlots(t *testing.T) {
	src := `import { typefor } from '@rhombus-std/primitives.extras';
interface IDep {}
interface IOther {}
class TupleRest { constructor(...deps: [IDep, IOther]) { void deps; } }
export const tupleRest = typefor(TupleRest);
`
	prog, app := buildTypeforWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	out, diags := lowerTypeforDiags(t, prog, app)
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	want := `Type.ctor(Type.imported("TupleRest", "@scope/app/main"), ` +
		`[[Type.imported("IDep", "@scope/app/main"), Type.imported("IOther", "@scope/app/main")]])`
	if got := exprFor(t, out, "tupleRest"); got != want {
		t.Errorf("tupleRest: got %q, want %q\nfull output:\n%s", got, want, out)
	}
}

// TestTypeforValueArgArrayRestParameterIsTheWholeArgumentList pins the OTHER
// rest shape alongside the tuple one above: an ARRAY-typed rest parameter
// (`...deps: IDep[]`) answers to zero or more IDep arguments, so the signature
// derives as the list itself — the row IS the argument list, not a single
// array-typed parameter.
func TestTypeforValueArgArrayRestParameterIsTheWholeArgumentList(t *testing.T) {
	src := `import { typefor } from '@rhombus-std/primitives.extras';
interface IDep {}
class ArrayRest { constructor(...deps: IDep[]) { void deps; } }
export const arrayRest = typefor(ArrayRest);
`
	prog, app := buildTypeforWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	out, diags := lowerTypeforDiags(t, prog, app)
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	want := `Type.ctor(Type.imported("ArrayRest", "@scope/app/main"), ` +
		`Type.global("Array", [Type.imported("IDep", "@scope/app/main")]))`
	if got := exprFor(t, out, "arrayRest"); got != want {
		t.Errorf("arrayRest: got %q, want %q\nfull output:\n%s", got, want, out)
	}
}

// TestTypeforValueArgPrefixRestParameterIsAnOpenTuple pins the combined shape:
// a required prefix ahead of a trailing rest derives as an open-length tuple —
// the fixed slots in order, the rest's element as the tuple's own rest slot.
func TestTypeforValueArgPrefixRestParameterIsAnOpenTuple(t *testing.T) {
	src := `import { typefor } from '@rhombus-std/primitives.extras';
interface IDep {}
interface IOther {}
class PrefixRest { constructor(head: IOther, ...deps: IDep[]) { void head; void deps; } }
export const prefixRest = typefor(PrefixRest);
`
	prog, app := buildTypeforWorkspace(t, src)
	defer func() { _ = prog.Close() }()

	out, diags := lowerTypeforDiags(t, prog, app)
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	want := `Type.ctor(Type.imported("PrefixRest", "@scope/app/main"), ` +
		`Type.tuple({ members: [Type.imported("IOther", "@scope/app/main")], rest: Type.imported("IDep", "@scope/app/main") }))`
	if got := exprFor(t, out, "prefixRest"); got != want {
		t.Errorf("prefixRest: got %q, want %q\nfull output:\n%s", got, want, out)
	}
}
