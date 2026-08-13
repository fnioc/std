package signaturetransform

import (
	"strings"
	"testing"

	"github.com/fnioc/std/transforms/internal/signatures"
)

// TestNewLowersComplexDepShapes drives the signatures extractor through the
// dependency-parameter shapes the simpler TestNewLowersDepSlotKinds does not
// reach: an inline function-type param, an optional param, an inline union
// param, an inline arrow VALUE, and a declaration-less ctor VALUE. Every shape
// derives cleanly (no diagnostic), reusing typefor's own type-classification
// narrowing (tokens.DeriveTyped) over each parameter's type — the same
// derivation a typefor(value) call would produce for an identically-shaped
// value.
//
// A REST parameter (`...deps: [A, B]`) is NOT among these shapes — see
// TestRestParameterIsAKnownGap below.
func TestNewLowersComplexDepShapes(t *testing.T) {
	mainSrc := `import { signatureof } from '@scope/prims';
interface IDep {}
interface IOther {}
interface IThing {}
class FnParam { constructor(make: (d: IDep) => IThing) { void make; } }
class OptParam { constructor(dep?: IDep) { void dep; } }
class UnionParam { constructor(dep: IDep | IOther) { void dep; } }
declare const Ctor: new (d: IDep) => IThing;
export const fnParam = signatureof(FnParam);
export const optParam = signatureof(OptParam);
export const unionParam = signatureof(UnionParam);
export const arrowValue = signatureof((x: IDep) => ({} as IThing));
export const ctorValue = signatureof(Ctor);
`
	prog, app := buildSigWorkspace(t, mainSrc)
	defer func() { _ = prog.Close() }()

	out, diags := lowerMain(t, prog, app)
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	if strings.Contains(out, "signatureof") {
		t.Errorf("a signatureof reference survived lowering:\n%s", out)
	}

	want := map[string]string{
		// Inline function-type param → a nested Type.func(...) node, resolved at
		// runtime as a late-bound callable (ToCallSiteVisitor.visitFunc) — no
		// special "factory slot" form needed.
		"fnParam": `Type.ctor(Type.imported("FnParam", "@scope/app/main"), ` +
			`Type.func(Type.imported("IThing", "@scope/app/main"), Type.imported("IDep", "@scope/app/main")))`,
		// Optional param → its type unioned with the nullish singleton, non-nullish first.
		"optParam": `Type.ctor(Type.imported("OptParam", "@scope/app/main"), ` +
			`Type.union(Type.imported("IDep", "@scope/app/main"), Type.typeLiteral(undefined)))`,
		// Inline union param → Type.union(...) over both members.
		"unionParam": `Type.ctor(Type.imported("UnionParam", "@scope/app/main"), ` +
			`Type.union(Type.imported("IDep", "@scope/app/main"), Type.imported("IOther", "@scope/app/main")))`,
		// Inline arrow value → its own call signature.
		"arrowValue": `Type.func(Type.imported("IThing", "@scope/app/main"), Type.imported("IDep", "@scope/app/main"))`,
		// Declaration-less ctor reference → its construct signature.
		"ctorValue": `Type.ctor(Type.imported("IThing", "@scope/app/main"), Type.imported("IDep", "@scope/app/main"))`,
	}
	for name, node := range want {
		if !strings.Contains(out, node) {
			t.Errorf("%s: expected node not found:\n  want: %s\n  full output:\n%s", name, node, out)
		}
	}
}

// TestRestParameterIsAKnownGap pins a deliberate Phase 1 scope limitation: a
// REST parameter derives to a single slot whose type is the parameter's own
// (tuple or array) type — tokens.DeriveTyped has no tuple-expansion case, so a
// tuple-typed rest param's element types are not individually reachable, and
// derivation reports codeUnderivableToken rather than silently misrepresenting
// the signature's arity. This mirrors typefor's own value-argument derivation,
// which has never expanded a rest parameter either — a hand-writer with an
// overloaded or variadic constructor still spells its Type.ctor(...) node
// directly rather than through signatureof.
func TestRestParameterIsAKnownGap(t *testing.T) {
	mainSrc := `import { signatureof } from '@scope/prims';
interface IDep {}
interface IOther {}
class TupleRest { constructor(...deps: [IDep, IOther]) { void deps; } }
export const tupleRest = signatureof(TupleRest);
`
	prog, app := buildSigWorkspace(t, mainSrc)
	defer func() { _ = prog.Close() }()

	out, diags := lowerMain(t, prog, app)
	if !strings.Contains(out, "signatureof(TupleRest)") {
		t.Errorf("a rest-parameter constructor must leave the call un-lowered:\n%s", out)
	}
	found := false
	for _, d := range diags {
		if d.Code == "990006" && d.Category == signatures.Error {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected a 990006 underivable-token error, got %+v", diags)
	}
}
